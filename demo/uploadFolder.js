const Nebulus = require('../index')
const nebulus = new Nebulus({ path: "storage" });
(async () => {
  await nebulus.init()
  nebulus.on("upload", (cid) => {
    console.log("uploaded", cid)
  })
  let cid = await nebulus.folder({
    "hello.txt": await nebulus.add(Buffer.from("hello x")),
    "world.txt": await nebulus.add(Buffer.from("world x")),
  })
  await nebulus.network.start()
  nebulus.network.upload(cid)
})();
