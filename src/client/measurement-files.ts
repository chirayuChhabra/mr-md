export interface TimelineExport {
 version: 1;
 exportedAt: string;
 simulation: { id: string; label: string };
 activeBranchId: string;
 branches: unknown[];
 measurements: Record<string, unknown>;
 graphs: unknown[];
}

export function measurementFilename(name: string, extension: 'png' | 'json' | 'csv'): string {
 const stem = name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 100) || 'Snapshot';
 return `${stem}.${extension}`;
}

export function validSnapshotImage(value: unknown): value is string {
 return typeof value === 'string' && value.length < 32 * 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value);
}

export function downloadMeasurementFile(doc: Document, content: Blob, filename: string): void {
 const view = doc.defaultView;
 if (!view) return;
 const url = view.URL.createObjectURL(content);
 const link = doc.createElement('a');
 link.href = url;
 link.download = filename;
 doc.body.append(link);
 link.click();
 link.remove();
 view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
}

export function downloadSnapshotImage(doc: Document, data: string, name: string): boolean {
 if (!validSnapshotImage(data)) return false;
 const binary = atob(data.slice(data.indexOf(',') + 1));
 const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
 downloadMeasurementFile(doc, new Blob([bytes], { type: 'image/png' }), measurementFilename(name, 'png'));
 return true;
}
