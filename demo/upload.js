const Nebulus = require('../index')
const nebulus = new Nebulus({path: "storage"});
(async () => {
  await nebulus.connect()
  nebulus.on("push", (cid) => {
    console.log("pushed", cid)
  })
  let cid = await nebulus.add(Buffer.from("die zauberflote xyz"))
  nebulus.push(cid)
})();
