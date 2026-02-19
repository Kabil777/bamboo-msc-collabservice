"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Redlock = exports.Lock = exports.ExecutionError = exports.ResourceLockedError = void 0;
const crypto_1 = require("crypto");
const events_1 = require("events");
const scripts_1 = require("./scripts");
// Define default settings.
const defaultSettings = {
    driftFactor: 0.01,
    retryCount: 10,
    retryDelay: 200,
    retryJitter: 100,
    automaticExtensionThreshold: 500,
    db: 0
};
// Modifyng this object is forbidden.
Object.freeze(defaultSettings);
/*
 * This error indicates a failure due to the existence of another lock for one
 * or more of the requested resources.
 */
class ResourceLockedError extends Error {
    message;
    constructor(message) {
        super();
        this.message = message;
        this.name = 'ResourceLockedError';
    }
}
exports.ResourceLockedError = ResourceLockedError;
/*
 * This error indicates a failure of an operation to pass with a quorum.
 */
class ExecutionError extends Error {
    message;
    attempts;
    constructor(message, attempts) {
        super();
        this.message = message;
        this.attempts = attempts;
        this.name = 'ExecutionError';
    }
}
exports.ExecutionError = ExecutionError;
/*
 * An object of this type is returned when a resource is successfully locked. It
 * contains convenience methods `release` and `extend` which perform the
 * associated Redlock method on itself.
 */
class Lock {
    redlock;
    resources;
    value;
    attempts;
    expiration;
    settings;
    constructor(redlock, resources, value, attempts, expiration, settings) {
        this.redlock = redlock;
        this.resources = resources;
        this.value = value;
        this.attempts = attempts;
        this.expiration = expiration;
        this.settings = settings;
    }
    async release() {
        return this.redlock.release(this);
    }
    async extend(duration) {
        return this.redlock.extend(this, duration, this.settings);
    }
}
exports.Lock = Lock;
/**
 * A redlock object is instantiated with an array of at least one redis client
 * and an optional `options` object. Properties of the Redlock object should NOT
 * be changed after it is first used, as doing so could have unintended
 * consequences for live locks.
 */
class Redlock extends events_1.EventEmitter {
    clients;
    settings;
    constructor(clients, settings = {}) {
        super();
        // Prevent crashes on error events.
        this.on('error', () => {
            // Because redlock is designed for high availability, it does not care if
            // a minority of redis instances/clusters fail at an operation.
            //
            // However, it can be helpful to monitor and log such cases. Redlock emits
            // an "error" event whenever it encounters an error, even if the error is
            // ignored in its normal operation.
            //
            // This function serves to prevent node's default behavior of crashing
            // when an "error" event is emitted in the absence of listeners.
        });
        // Create a new array of client, to ensure no accidental mutation.
        this.clients = new Set(clients);
        if (this.clients.size === 0) {
            throw new Error('Redlock must be instantiated with at least one redis client.');
        }
        // Customize the settings for this instance.
        this.settings = {
            driftFactor: typeof settings.driftFactor === 'number'
                ? settings.driftFactor
                : defaultSettings.driftFactor,
            retryCount: typeof settings.retryCount === 'number' ? settings.retryCount : defaultSettings.retryCount,
            retryDelay: typeof settings.retryDelay === 'number' ? settings.retryDelay : defaultSettings.retryDelay,
            retryJitter: typeof settings.retryJitter === 'number'
                ? settings.retryJitter
                : defaultSettings.retryJitter,
            automaticExtensionThreshold: typeof settings.automaticExtensionThreshold === 'number'
                ? settings.automaticExtensionThreshold
                : defaultSettings.automaticExtensionThreshold,
            db: (typeof settings.db === 'number' && Number.isInteger(settings.db) && settings.db >= 0 && settings.db <= 15)
                // settings.db value must be a number and between 0 and 15, inclusive.
                ? settings.db
                : defaultSettings.db,
        };
    }
    /**
     * Generate a sha1 hash compatible with redis evalsha.
     */
    _hash(value) {
        return (0, crypto_1.createHash)('sha1').update(value).digest('hex');
    }
    /**
     * Generate a cryptographically random string.
     */
    _random() {
        return (0, crypto_1.randomBytes)(16).toString('hex');
    }
    /**
     * This method runs `.quit()` on all client connections.
     */
    async quit() {
        const results = [];
        for (const client of this.clients) {
            results.push(client.quit());
        }
        await Promise.all(results);
    }
    /**
     * This method acquires a locks on the resources for the duration specified by
     * the `duration`.
     */
    async acquire(resources, duration, settings) {
        if (Math.floor(duration) !== duration) {
            throw new Error('Duration must be an integer value in milliseconds.');
        }
        const value = this._random();
        try {
            const { attempts, start } = await this._execute('acquireLock', resources, [this.settings.db, value, duration], settings);
            // Add 2 milliseconds to the drift to account for Redis expires precision,
            // which is 1 ms, plus the configured allowable drift factor.
            const drift = Math.round((settings?.driftFactor ?? this.settings.driftFactor) * duration) + 2;
            return new Lock(this, resources, value, attempts, start + duration - drift, settings);
        }
        catch (error) {
            // If there was an error acquiring the lock, release any partial lock
            // state that may exist on a minority of clients.
            await this._execute('releaseLock', resources, [this.settings.db, value], {
                retryCount: 0,
            }).catch(() => {
                // Any error here will be ignored.
            });
            throw error;
        }
    }
    /**
     * This method unlocks the provided lock from all servers still persisting it.
     * It will fail with an error if it is unable to release the lock on a quorum
     * of nodes, but will make no attempt to restore the lock in the case of a
     * failure to release. It is safe to re-attempt a release or to ignore the
     * error, as the lock will automatically expire after its timeout.
     */
    async release(lock, settings) {
        // Immediately invalidate the lock.
        lock.expiration = 0;
        // Attempt to release the lock.
        return this._execute('releaseLock', lock.resources, [this.settings.db, lock.value], settings);
    }
    /**
     * This method extends a valid lock by the provided `duration`.
     */
    async extend(existing, duration, settings) {
        if (Math.floor(duration) !== duration) {
            throw new Error('Duration must be an integer value in milliseconds.');
        }
        // The lock has already expired.
        if (existing.expiration < Date.now()) {
            throw new ExecutionError('Cannot extend an already-expired lock.', []);
        }
        const { attempts, start } = await this._execute('extendLock', existing.resources, [this.settings.db, existing.value, duration], settings);
        // Invalidate the existing lock.
        existing.expiration = 0;
        // Add 2 milliseconds to the drift to account for Redis expires precision,
        // which is 1 ms, plus the configured allowable drift factor.
        const drift = Math.round((settings?.driftFactor ?? this.settings.driftFactor) * duration) + 2;
        return new Lock(this, existing.resources, existing.value, attempts, start + duration - drift, settings);
    }
    /**
     * Execute a script on all clients. The resulting promise is resolved or
     * rejected as soon as this quorum is reached; the resolution or rejection
     * will contains a `stats` property that is resolved once all votes are in.
     */
    async _execute(command, keys, args, _settings) {
        const settings = _settings
            ? {
                ...this.settings,
                ..._settings,
            }
            : this.settings;
        // For the purpose of easy config serialization, we treat a retryCount of
        // -1 a equivalent to Infinity.
        const maxAttempts = settings.retryCount === -1 ? Infinity : settings.retryCount + 1;
        const attempts = [];
        while (attempts.length < maxAttempts) {
            const { vote, stats, start } = await this._attemptOperation(command, keys, args);
            attempts.push(stats);
            // The operation achieved a quorum in favor.
            if (vote === 'for') {
                return { attempts, start };
            }
            // Wait before reattempting.
            if (attempts.length < maxAttempts) {
                await new Promise((resolve) => {
                    setTimeout(resolve, Math.max(0, settings.retryDelay + Math.floor((Math.random() * 2 - 1) * settings.retryJitter)), undefined);
                });
            }
        }
        throw new ExecutionError('The operation was unable to achieve a quorum during its retry window.', attempts);
    }
    async _attemptOperation(script, keys, args) {
        const start = Date.now();
        return await new Promise((resolve) => {
            const clientResults = [];
            for (const client of this.clients) {
                clientResults.push(this._attemptOperationOnClient(client, script, keys, args));
            }
            const stats = {
                membershipSize: clientResults.length,
                quorumSize: Math.floor(clientResults.length / 2) + 1,
                votesFor: new Set(),
                votesAgainst: new Map(),
            };
            let done;
            const statsPromise = new Promise((resolve) => {
                done = () => resolve(stats);
            });
            // This is the expected flow for all successful and unsuccessful requests.
            const onResultResolve = (clientResult) => {
                switch (clientResult.vote) {
                    case 'for':
                        stats.votesFor.add(clientResult.client);
                        break;
                    case 'against':
                        stats.votesAgainst.set(clientResult.client, clientResult.error);
                        break;
                }
                // A quorum has determined a success.
                if (stats.votesFor.size === stats.quorumSize) {
                    resolve({
                        vote: 'for',
                        stats: statsPromise,
                        start,
                    });
                }
                // A quorum has determined a failure.
                if (stats.votesAgainst.size === stats.quorumSize) {
                    resolve({
                        vote: 'against',
                        stats: statsPromise,
                        start,
                    });
                }
                // All votes are in.
                if (stats.votesFor.size + stats.votesAgainst.size === stats.membershipSize) {
                    done();
                }
            };
            // This is unexpected and should crash to prevent undefined behavior.
            const onResultReject = (error) => {
                throw error;
            };
            for (const result of clientResults) {
                result.then(onResultResolve, onResultReject);
            }
        });
    }
    async _attemptOperationOnClient(client, script, keys, args) {
        try {
            (0, scripts_1.ensureCommands)(client);
            const shaResult = await client[script](keys.length, ...keys, ...args);
            // Attempt to evaluate the script by its hash.
            if (typeof shaResult !== 'number') {
                throw new Error(`Unexpected result of type ${typeof shaResult} returned from redis.`);
            }
            const result = shaResult;
            // One or more of the resources was already locked.
            if (result !== keys.length) {
                throw new ResourceLockedError(`The operation was applied to: ${result} of the ${keys.length} requested resources.`);
            }
            return {
                vote: 'for',
                client,
                value: result,
            };
        }
        catch (error) {
            if (!(error instanceof Error)) {
                throw new Error(`Unexpected type ${typeof error} thrown with value: ${error}`);
            }
            // Emit the error on the redlock instance for observability.
            this.emit('error', error);
            return {
                vote: 'against',
                client,
                error,
            };
        }
    }
    async using(resources, duration, settingsOrRoutine, optionalRoutine) {
        if (Math.floor(duration) !== duration) {
            throw new Error('Duration must be an integer value in milliseconds.');
        }
        const settings = settingsOrRoutine && typeof settingsOrRoutine !== 'function'
            ? {
                ...this.settings,
                ...settingsOrRoutine,
            }
            : this.settings;
        const routine = optionalRoutine ?? settingsOrRoutine;
        if (typeof routine !== 'function') {
            throw new Error('INVARIANT: routine is not a function.');
        }
        if (settings.automaticExtensionThreshold > duration - 100) {
            throw new Error('A lock `duration` must be at least 100ms greater than the `automaticExtensionThreshold` setting.');
        }
        // The AbortController/AbortSignal pattern allows the routine to be notified
        // of a failure to extend the lock, and subsequent expiration. In the event
        // of an abort, the error object will be made available at `signal.error`.
        const controller = new AbortController();
        const signal = controller.signal;
        function queue() {
            timeout = setTimeout(() => (extension = extend()), context.lock.expiration - Date.now() - settings.automaticExtensionThreshold);
        }
        async function extend() {
            timeout = undefined;
            try {
                context.lock = await context.lock.extend(duration);
                context.extensions += 1;
                queue();
            }
            catch (error) {
                if (!(error instanceof Error)) {
                    throw new Error(`Unexpected thrown ${typeof error}: ${error}.`);
                }
                if (context.lock.expiration > Date.now()) {
                    return (extension = extend());
                }
                signal.error = error instanceof Error ? error : new Error(`${error}`);
                controller.abort();
            }
        }
        let timeout;
        let extension;
        const context = {
            lock: await this.acquire(resources, duration, settings),
            extensions: 0,
        };
        queue();
        try {
            return await routine(signal, context);
        }
        finally {
            // Clean up the timer.
            if (timeout) {
                clearTimeout(timeout);
                timeout = undefined;
            }
            // Wait for an in-flight extension to finish.
            if (extension) {
                await extension.catch(() => {
                    // An error here doesn't matter at all, because the routine has
                    // already completed, and a release will be attempted regardless. The
                    // only reason for waiting here is to prevent possible contention
                    // between the extension and release.
                });
            }
            await context.lock.release();
        }
    }
}
exports.Redlock = Redlock;
//# sourceMappingURL=index.js.map