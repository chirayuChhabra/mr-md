import { expect, test } from 'bun:test';
import { measurementFilename, validSnapshotImage } from '../src/client/measurement-files';
test('download names remain filenames and snapshot images accept only bounded PNG data', () => {
 expect(measurementFilename('Trial / 1: spring', 'png')).toBe('Trial - 1- spring.png');
 expect(measurementFilename('', 'json')).toBe('Snapshot.json');
 expect(validSnapshotImage('data:text/html;base64,YQ==')).toBe(false);
 expect(validSnapshotImage('https://example.com/image.png')).toBe(false);
 expect(validSnapshotImage('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
});
