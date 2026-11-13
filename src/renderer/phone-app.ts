import { type DefaultTreeAdapterMap, parse, serialize } from "parse5";
import type { PhoneRouteData } from "../phone-app-data.js";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
function hasClass(node: Node, name: string): node is Element {
	return (
		"attrs" in node &&
		node.attrs.some(
			(attr) => attr.name === "class" && attr.value.split(/\s+/).includes(name),
		)
	);
}
function find(node: Node, check: (node: Node) => boolean): Element | undefined {
	if (check(node) && "tagName" in node) return node;
	if ("childNodes" in node)
		for (const child of node.childNodes) {
			const result = find(child, check);
			if (result) return result;
		}
}
function prune(node: Node) {
	if (!("childNodes" in node)) return;
	node.childNodes = node.childNodes.filter((child) => {
		if (!("tagName" in child)) return true;
		if (child.tagName === "template") return false;
		if (
			child.tagName === "iframe" &&
			(hasClass(node, "bk-embed-interactive") ||
				child.attrs.some((attr) => attr.name === "srcdoc"))
		)
			return false;
		if (
			child.tagName === "script" &&
			!child.attrs.some(
				(attr) => attr.name === "type" && attr.value === "application/json",
			)
		)
			return false;
		if (
			[
				"bk-chapter-dashboard",
				"bk-phone-reading-header",
				"bk-sidebar-expand",
			].some((name) => hasClass(child, name))
		)
			return false;
		if (hasClass(child, "bk-object")) {
			const notice = find(child, (el) => hasClass(el, "bk-phone-sim-notice"));
			if (notice) {
				const header = find(child, (el) => hasClass(el, "bk-object-header"));
				child.childNodes = header ? [header, notice] : [notice];
			}
		}
		prune(child);
		return true;
	});
}

/** The phone receives reading views, without desktop simulation runtimes or page chrome. */
export function phoneRouteFromHtml(
	html: string,
	title: string,
	isChapter: boolean,
): PhoneRouteData {
	const doc = parse(html);
	const main = find(doc, (node) => hasClass(node, "bk-main"));
	const nav = find(doc, (node) => hasClass(node, "bk-nav"));
	if (!main || !nav) throw new Error(`Missing phone view: ${title}`);
	prune(main);
	return { title, isChapter, main: serialize(main), nav: serialize(nav) };
}
