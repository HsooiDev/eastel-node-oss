import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Execute actual page handlers, not a second implementation of their guards.
const filename = 'app/hs/marketing-design/page.tsx'
const source = fs.readFileSync(filename, 'utf8')
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set(['addTextLayer', 'addImageLayer', 'handlePointerDown', 'handlePointerMove', 'handlePointerUp'])
const functions = [], styles = {}
function walk(node) {
  if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) functions.push(node.getText(ast))
  if (ts.isPropertyAssignment(node) && ['height', 'backgroundColor'].includes(node.name.getText(ast)) && node.initializer.getText(ast).includes('shape.shapeType')) {
    styles[node.name.getText(ast)] = node.initializer.getText(ast)
  }
  ts.forEachChild(node, walk)
}
walk(ast)
assert.equal(functions.length, names.size)
const setup = `
let textLayers=[], imageLayers=[], allLayers=[], positions=[];
let isDragging={current:false}, dragHistoryRecorded={current:false}, dragStart={current:null},
dragOrigin={current:null}, dragZoom={current:1}, dragLayerId={current:null}, dragLayerType={current:null}, zoom=0.5;
const recordHistory=()=>{}; const getMaxZ=()=>0;
const setSelectedLayerId=()=>{}; const setSelectedLayerType=()=>{};
const setTextLayers=f=>textLayers=f(textLayers); const setImageLayers=f=>imageLayers=f(imageLayers);
const updateLayerPosition=(id,type,x,y)=>positions.push({id,type,x,y});
`
const compiled = ts.transpileModule(setup + functions.join('\n') + `
addTextLayer(); addImageLayer('/synthetic.png'); allLayers=[...textLayers,...imageLayers];
for(const layer of allLayers){
  const target={captured:false,setPointerCapture(){this.captured=true},hasPointerCapture(){return this.captured},releasePointerCapture(){this.captured=false}};
  const event={stopPropagation(){},clientX:10,clientY:10,pointerId:1,currentTarget:target};
  handlePointerDown(event,layer.id,layer.type);
  assert.equal(isDragging.current,true,layer.type+' begins dragging immediately after creation');
  handlePointerMove({...event,clientX:30,clientY:35});
  assert.equal(positions.at(-1).x,90); assert.equal(positions.at(-1).y,100);
  handlePointerUp(event); assert.equal(target.captured,false);
  for(const field of ['locked','visible']){
    layer[field]=field==='locked'; handlePointerDown(event,layer.id,layer.type);
    assert.equal(isDragging.current,false,field+' prevents drag'); layer.locked=false;layer.visible=true;
  }
  delete layer.visible; handlePointerDown(event,layer.id,layer.type);
  assert.equal(isDragging.current,true,'legacy omitted visible defaults to shown'); handlePointerUp(event);
}
`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
vm.runInNewContext(compiled, { assert, Date, Math })
for (const shape of [
  { shapeType: 'line', fillColor: '#ff0000', strokeColor: '#0000ff', strokeWidth: 3, height: 120 },
  { shapeType: 'line', fillColor: '', strokeColor: '#0000ff', strokeWidth: 0, height: 120 },
]) {
  assert.equal(vm.runInNewContext(styles.height, { shape }), shape.strokeWidth || 4)
  assert.equal(vm.runInNewContext(styles.backgroundColor, { shape }), shape.fillColor || shape.strokeColor || '#000000')
}
console.log('PASS: actual page new text/image drag, zoom coordinates, locked/hidden/default-visible guards and PHP line rendering')
