import { z } from "zod";

export const measurementInteractionSchema = z.object({
	id: z.string().min(1).max(200),
	label: z.string().min(1).max(120),
});

const measurementPointSchema = z.object({
	sampleId: z.number().int().nonnegative().optional(),
	interaction: measurementInteractionSchema.optional(),
	time: z.number().finite(),
	x: z.number().finite(),
	y: z.number().finite(),
	branchId: z.string().optional(),
});
const snapshotSchema = z.object({
	measurementHistory: z
		.record(z.string(), z.array(measurementPointSchema))
		.optional(),
	id: z.string(),
	simId: z.string().optional(),
	time: z.number().finite(),
	timestamp: z.number().finite(),
	label: z.string(),
	props: z.record(z.string(), z.unknown()),
	telemetry: z.record(z.string(), z.unknown()),
	state: z.unknown().optional(),
	isExact: z.boolean(),
	imageDataUrl: z.string().optional(),
});
export const savedCollectionSchema = z.object({
	version: z.literal(1),
	moments: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			savedAt: z.number(),
			snapshot: snapshotSchema,
		}),
	),
	workspace: snapshotSchema.optional(),
});
export type SavedCollection = z.infer<typeof savedCollectionSchema>;
export type SavedMoment = SavedCollection["moments"][number];
export interface ExperimentStore {
	read(): Promise<SavedCollection>;
	write(value: SavedCollection): Promise<void>;
}
export type ExperimentStorageError =
	| "unavailable"
	| "invalid-data"
	| "write-failed";

export function experimentStore(
	factory: IDBFactory | undefined,
	scope: string,
): ExperimentStore {
	const database = () =>
		new Promise<IDBDatabase>((resolve, reject) => {
			if (!factory)
				return reject(
					new Error("unavailable" satisfies ExperimentStorageError),
				);
			const request = factory.open("mr-md-saved-experiments", 1);
			request.onupgradeneeded = () =>
				request.result.createObjectStore("experiments");
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(new Error("unavailable" satisfies ExperimentStorageError));
		});
	return {
		async read() {
			const db = await database();
			try {
				const value = await new Promise<unknown>((resolve, reject) => {
					const request = db
						.transaction("experiments")
						.objectStore("experiments")
						.get(scope);
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(new Error("unavailable"));
				});
				if (value === undefined) {
					const moments = new Map<string, SavedMoment>();
					// Older builds scoped records to the generated iframe, so runtime edits
					// stranded them under a different hash. Keep those records intact.
					if (scope.endsWith(":saved")) {
						await new Promise<void>((resolve, reject) => {
							const request = db
								.transaction("experiments")
								.objectStore("experiments")
								.openCursor();
							request.onerror = () => reject(new Error("unavailable"));
							request.onsuccess = () => {
								const cursor = request.result;
								if (!cursor) return resolve();
								const key = String(cursor.key);
								if (
									key.startsWith(scope + ":") &&
									/^\d+$/.test(key.slice(scope.length + 1))
								) {
									const parsed = savedCollectionSchema.safeParse(cursor.value);
									if (!parsed.success) return reject(new Error("invalid-data"));
									for (const moment of parsed.data.moments) {
										if (!moments.has(moment.id)) moments.set(moment.id, moment);
									}
								}
								cursor.continue();
							};
						});
					}
					const recovered: SavedCollection = {
						version: 1,
						moments: [...moments.values()].sort(
							(a, b) => b.savedAt - a.savedAt,
						),
					};
					// Write even an empty collection once, so deleted states cannot return
					// from legacy records on the next load.
					await new Promise<void>((resolve, reject) => {
						const tx = db.transaction("experiments", "readwrite");
						tx.oncomplete = () => resolve();
						tx.onerror = tx.onabort = () => reject(new Error("write-failed"));
						tx.objectStore("experiments").put(recovered, scope);
					});
					return recovered;
				}
				const parsed = savedCollectionSchema.safeParse(value);
				if (!parsed.success)
					throw new Error("invalid-data" satisfies ExperimentStorageError);
				return parsed.data;
			} finally {
				db.close();
			}
		},
		async write(value) {
			const validated = savedCollectionSchema.parse(value);
			const db = await database();
			try {
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction("experiments", "readwrite");
					tx.oncomplete = () => resolve();
					tx.onerror = tx.onabort = () =>
						reject(new Error("write-failed" satisfies ExperimentStorageError));
					tx.objectStore("experiments").put(validated, scope);
				});
			} finally {
				db.close();
			}
		},
	};
}
