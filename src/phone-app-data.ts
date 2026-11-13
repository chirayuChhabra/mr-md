export interface PhoneRouteData {
	title: string;
	main: string;
	nav: string;
	isChapter: boolean;
}

export interface PhoneAppData {
	version: 1;
	home: string;
	routes: Record<string, PhoneRouteData>;
}

export function readPhoneAppData(value: unknown): PhoneAppData {
	if (!value || typeof value !== "object")
		throw new Error("Invalid phone app bundle");
	const data = value as Partial<PhoneAppData>;
	if (
		data.version !== 1 ||
		typeof data.home !== "string" ||
		!data.routes ||
		typeof data.routes !== "object"
	)
		throw new Error("Invalid phone app bundle");
	for (const route of Object.values(data.routes)) {
		if (
			!route ||
			typeof route.title !== "string" ||
			typeof route.main !== "string" ||
			typeof route.nav !== "string" ||
			typeof route.isChapter !== "boolean"
		)
			throw new Error("Invalid phone route");
	}
	if (!Object.hasOwn(data.routes, data.home))
		throw new Error("Missing phone home route");
	return data as PhoneAppData;
}
