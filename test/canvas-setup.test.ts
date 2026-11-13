import { expect, test } from "bun:test";
import { canvasFramingRuntime } from "../src/renderer/blocks/canvas-framing.js";

function setupResolver() {
 const scope: any = { addEventListener() {} };
 new Function("window", canvasFramingRuntime())(scope);
 return scope.bkResolveSetup;
}

test("all canvas setup overloads reject invalid logical dimensions", () => {
 const resolve = setupResolver();
 const draw = () => {};
 for (const invalid of [0, -1, Infinity, NaN, "800"]) {
  for (const [width, height] of [[invalid, 450], [800, invalid]]) {
   expect(() => resolve(draw, {width,height})).toThrow(RangeError);
   expect(() => resolve(width,height,draw)).toThrow(RangeError);
   expect(() => resolve(width,height,{framing:"contain"},draw)).toThrow(RangeError);
  }
 }
 expect(resolve(800,450,draw,{framing:"contain"})).toMatchObject({width:800,height:450,draw,options:{framing:"contain"}});
 expect(resolve(draw)).toMatchObject({width:800,height:450,draw});
});
