import {
    PostStatus,
    Visibility,
} from "../../http/controllers/blogSaveController/blogSaveController.js";
import { DocsContentPayload } from "../../api/postClient/CommandClient.js";
import { generateMarkdown } from "./yToMarkdown.js";
import { DocsSidebarStateRepository } from "../../repository/collab/DocsSideBarState.js";
import { DocsStateRepository } from "../../repository/collab/DocsStateRepository.js";
import { CollabServer } from "../../ws/servers/CollabServer.js";
import * as Y from "yjs";

type saveDocsParams = {
    docId: string;
    visibility?: Visibility;
    status?: PostStatus;
    ownerId: string;
    collabServer: CollabServer;
    docsRepository: DocsStateRepository;
    docsSideBarRepository: DocsSidebarStateRepository;
};

type SidebarNode = {
    id: string;
    title: string;
    parentId?: string;
    level?: number;
    order?: number;
};

function toYDoc(state: Uint8Array | null): Y.Doc | null {
    if (!state) {
        return null;
    }

    const document = new Y.Doc();
    Y.applyUpdate(document, state);
    return document;
}

function getSidebarDoc(
    collabServer: CollabServer,
    docsId: string,
): Y.Doc | null {
    return (
        collabServer
            .getInstance()
            .hocuspocus.documents.get(`docs:sidebar:${docsId}`) || null
    );
}

function getPageDoc(
    collabServer: CollabServer,
    docsId: string,
    pageId: string,
): Y.Doc | null {
    return (
        collabServer
            .getInstance()
            .hocuspocus.documents.get(`docs:page:${docsId}:${pageId}`) || null
    );
}

async function persistLiveSidebarDoc(
    repository: DocsSidebarStateRepository,
    docsId: string,
    document: Y.Doc,
): Promise<void> {
    await repository.saveDocsSidebarStateById(
        docsId,
        Y.encodeStateAsUpdate(document),
    );
}

async function persistLivePageDoc(
    repository: DocsStateRepository,
    docsId: string,
    pageId: string,
    document: Y.Doc,
): Promise<void> {
    await repository.saveDocsStateById(
        pageId,
        docsId,
        Y.encodeStateAsUpdate(document),
    );
}

function extractSidebarNodes(document: Y.Doc): SidebarNode[] {
    try {
        return document
            .getArray<Y.Map<unknown>>("pages")
            .toArray()
            .map((page) => ({
                id: String(page.get("id") ?? ""),
                title: String(page.get("title") ?? "Untitled"),
                parentId:
                    typeof page.get("parentId") === "string"
                        ? String(page.get("parentId"))
                        : undefined,
                level:
                    typeof page.get("level") === "number"
                        ? Number(page.get("level"))
                        : undefined,
                order:
                    typeof page.get("order") === "number"
                        ? Number(page.get("order"))
                        : undefined,
            }))
            .filter((page) => page.id.length > 0);
    } catch {
        return [];
    }
}

function sortSidebarNodes(
    nodes: SidebarNode[],
    overviewId?: string,
): SidebarNode[] {
    return [...nodes].sort((left, right) => {
        const leftIsOverview = left.id === overviewId;
        const rightIsOverview = right.id === overviewId;

        if (leftIsOverview !== rightIsOverview) {
            return leftIsOverview ? -1 : 1;
        }

        const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        return left.title.localeCompare(right.title);
    });
}

function buildTree(
    nodes: SidebarNode[],
    markdownByPageId: Map<string, string>,
    overviewId: string,
): DocsContentPayload["tree"] {
    const sortedNodes = sortSidebarNodes(nodes, overviewId);
    const topLevel = sortedNodes.filter((node) => (node.level ?? 0) === 0);
    const childrenByParentId = new Map<string, SidebarNode[]>();

    for (const node of sortedNodes) {
        if (!node.parentId) {
            continue;
        }

        const children = childrenByParentId.get(node.parentId) ?? [];
        children.push(node);
        childrenByParentId.set(
            node.parentId,
            sortSidebarNodes(children, overviewId),
        );
    }

    const buildNode = (
        node: SidebarNode,
    ): DocsContentPayload["tree"][number] => ({
        id: node.id,
        title: node.title,
        content: markdownByPageId.get(node.id) ?? "",
        subTree: (childrenByParentId.get(node.id) ?? []).map(buildNode),
    });

    return topLevel.map(buildNode);
}

export async function saveDocs({
    docId,
    visibility,
    status,
    ownerId: _ownerId,
    collabServer,
    docsRepository,
    docsSideBarRepository,
}: saveDocsParams): Promise<DocsContentPayload | null> {
    const liveSidebarDoc = getSidebarDoc(collabServer, docId);

    if (liveSidebarDoc) {
        await persistLiveSidebarDoc(
            docsSideBarRepository,
            docId,
            liveSidebarDoc,
        );
    }

    const sidebarDoc =
        liveSidebarDoc ??
        toYDoc(await docsSideBarRepository.getDocsSidebarStateById(docId));

    if (!sidebarDoc) {
        return null;
    }

    const sidebarNodes = extractSidebarNodes(sidebarDoc);
    if (sidebarNodes.length === 0) {
        return null;
    }

    const markdownByPageId = new Map<string, string>();

    for (const node of sidebarNodes) {
        const livePageDoc = getPageDoc(collabServer, docId, node.id);
        if (livePageDoc) {
            await persistLivePageDoc(
                docsRepository,
                docId,
                node.id,
                livePageDoc,
            );
        }
        const pageDoc =
            livePageDoc ??
            toYDoc(await docsRepository.getDocsStateById(node.id));

        if (!pageDoc) {
            continue;
        }

        markdownByPageId.set(node.id, generateMarkdown(pageDoc));
    }

    return {
        tree: buildTree(sidebarNodes, markdownByPageId, docId),
        pages: Array.from(markdownByPageId.entries()).map(
            ([pageId, markdown]) => ({
                pageId,
                markdown,
            }),
        ),
        visibility,
        status,
    };
}
