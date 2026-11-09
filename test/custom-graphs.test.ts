import { expect, test } from 'bun:test';
import { customGraphSpec, pairGraphSamples } from '../src/client/measurement-custom-graphs';

test('custom plots preserve axis labels and units, including ungraphed measurements', () => {
 const result = customGraphSpec({ velocity: { label: 'Velocity', unit: 'm/s' }, displacement: { label: 'Displacement', unit: 'm' } }, 'velocity', 'displacement');
 expect(result.ok).toBe(true);
 if (!result.ok) return;
 expect(result.spec.yKey).toBe('displacement');
 expect(result.spec.xAxis).toEqual({ key: 'velocity', label: 'Velocity', unit: 'm/s' });
 expect(result.spec.yAxis).toEqual({ label: 'Displacement', unit: 'm' });
 expect(result.spec.label).toBe('Displacement vs Velocity');
});
test('custom plots reject unknown axes and support elapsed time', () => {
 expect(customGraphSpec({ energy: { unit: 'J' } }, '__proto__', 'energy').ok).toBe(false);
 expect(customGraphSpec({ energy: { unit: 'J' } }, 'time', 'missing').ok).toBe(false);
 const result = customGraphSpec({ energy: { unit: 'J' } }, 'time', 'energy');
 if (!result.ok) throw new Error(result.message);
 expect(result.spec.xAxis).toEqual({ key: 'time', label: 'Time', unit: 's' });
});

test('custom history pairs values within the same branch and excludes missing or invalid samples', () => {
 const point = (time: number, y: number, branchId = 'main') => ({time, x: time, y, branchId});
 expect(pairGraphSamples('velocity', [point(1, 2), point(2, 5, 'other')], [point(1, 3), point(2, 4), point(3, NaN)])).toEqual([{time:1,x:2,y:3,branchId:'main'}]);
 expect(pairGraphSamples('time', [], [point(1, 3)])).toEqual([{time:1,x:1,y:3,branchId:'main'}]);
});
