import { compileProject } from "../compiler.js";

/** Compatibility helper for integrations that still consume a chapter manifest. */
export function generateChapterContent(targetPath: string): string {
	const document = compileProject(targetPath);
	const { title, description } = document.chapter.meta;
	const links = document.chapter.lessons.map(
		(lesson, index) =>
			`- [${lesson.meta.title.replace(/[[\]\r\n]/g, " ")}](${encodeURI(document.sourceFiles[index]).replace(/\(/g, "%28").replace(/\)/g, "%29")})`,
	);
	return [
		"---",
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description ?? "")}`,
		"chapter: true",
		"---",
		...links,
		"",
	].join("\n");
}
