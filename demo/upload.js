const Nebulus = require('../index')
const nebulus = new Nebulus({path: "storage"});
(async () => {
  await nebulus.init()
  nebulus.on("upload", (cid) => {
    console.log("uploaded", cid)
  })
  let cid = await nebulus.add(Buffer.from("die zauberflote"))
  await nebulus.network.start()
  nebulus.network.upload(cid)
})();
