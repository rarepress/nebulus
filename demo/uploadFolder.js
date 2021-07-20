const Nebulus = require('../index')
const nebulus = new Nebulus({ path: "storage" });
(async () => {
  let cid = await nebulus.folder({
    "hello.txt": await nebulus.add(Buffer.from("hello xyz")),
    "world.txt": await nebulus.add(Buffer.from("world xyz")),
  })
  console.log("connect to ipfs...")
  await nebulus.connect()
  console.log("push", cid)
  nebulus.on("push", async (cid) => {
    console.log("uploaded", cid)
    console.log("disconnecting from ipfs...")
    await nebulus.disconnect()
    console.log("disconnected")
  })
  nebulus.push(cid)
})();
