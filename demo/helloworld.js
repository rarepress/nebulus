const nebulus = require('../index')
const n = new nebulus();
(async () => {
  let cid = await n.add(Buffer.from('hello world'))
  console.log("cid = ", cid)
  await n.connect()
  n.on("push:bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e", (cid) => {
    console.log("pushed", cid)
  })
  n.push(cid)
})();
