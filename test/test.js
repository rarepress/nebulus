const assert = require('assert');
const axios = require('axios')
const fs = require('fs')
const path = require('path')
const rmfr = require('rmfr')
const Nebulus = require('../index')
const STORE = __dirname + "/storage"
var nebulus
describe('nebulus', function() {
  before(async () => {
    console.log("deleting all files")
    await rmfr(STORE)
    nebulus = new Nebulus({ path: STORE })
  })
  describe("writing", () => {
    describe("add", () => {
      it('should add buffers correctly', async () => {
        const buffer = Buffer.from("hello world")
        const cid = await nebulus.add(buffer)
        assert.equal(cid, "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e")
      });
      it('should add file paths correctly', async () => {
        await fs.promises.writeFile(__dirname + "/fixture/hello.txt", "hello world")
        const cid = await nebulus.add(__dirname + "/fixture/hello.txt")
        assert.equal(cid, "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e")
      })
    })
    describe("download", () => {
      it('should download files correctly', async () => {
        const cid = await nebulus.download("https://ipfs.io/ipfs/bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e")
        assert.equal(cid, "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e")
      });
      it('should create two different files for two different files from the same URL', async () => {
        const cid0 = await nebulus.download("https://thisartworkdoesnotexist.com")
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve()
          }, 1000)
        })
        const cid1 = await nebulus.download("https://thisartworkdoesnotexist.com")
        assert.notEqual(cid0, cid1)
      });
    })
    describe('folder', () => {
      it('should construct folder correctly', async () => {
        let cid = await nebulus.folder({
          "readme.md": await nebulus.add("https://raw.githubusercontent.com/skogard/rarepress.js/0ad35d7da27a4d1e5f990a3bcf301e3fa9bae7ec/README.md"),
          "index.js": await nebulus.add("https://raw.githubusercontent.com/skogard/rarepress.js/0ad35d7da27a4d1e5f990a3bcf301e3fa9bae7ec/index.js"),
          "package.json": await nebulus.add("https://raw.githubusercontent.com/skogard/rarepress.js/0ad35d7da27a4d1e5f990a3bcf301e3fa9bae7ec/package.json"),
          "press.png": await nebulus.add("https://github.com/skogard/rarepress.js/raw/0ad35d7da27a4d1e5f990a3bcf301e3fa9bae7ec/press.png")
        })
        let files = await fs.promises.readdir(STORE + "/ipfs/" + cid)
        assert.deepEqual(files, ["index.js", "package.json", "press.png", "readme.md"])
      })
    })
    describe('ipfs', () => {
      before(async function() {
        await nebulus.connect()
      })
      describe("pull", () => {
        // same as "ipfs.download"
        it('should dowload folders correctly', async () => {
          const cid = "bafybeicaivkonz2sofegu2thshbeod3723ye2i5c5ivsyhv7gyuyunyyoq"
          nebulus.pull(cid)
          await new Promise((resolve, reject) => {
            nebulus.on("pull", (downloaded_cid) => {
              let filePath = STORE + "/ipfs/" + downloaded_cid
              // 1. check cid
              assert.equal(cid, downloaded_cid) 
              // 2. Check the file exists
              fs.access(filePath, fs.constants.F_OK, (err) => {
                assert(!err)
                // 3. Check the file is symbolic link
                fs.lstat(filePath, (err,stats) => {
                  assert(stats.isDirectory())
                  resolve()
                })
              });
            })
          })
        })
        it('should dowload files correctly', async () => {
          const cid = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e"
          nebulus.pull(cid)
          await new Promise((resolve, reject) => {
            nebulus.on("pull", (downloaded_cid) => {
              let filePath = STORE + "/ipfs/" + downloaded_cid
              // 1. check cid
              assert.equal(cid, downloaded_cid) 
              // 2. Check the file exists
              fs.access(filePath, fs.constants.F_OK, (err) => {
                assert(!err)
                // 3. Check the file is symbolic link
                fs.lstat(filePath, (err,stats) => {
                  assert(stats.isSymbolicLink())
                  // 4. Check the linked file exists
                  fs.readlink(filePath, (err, linkString) => {
                    assert(linkString)
                    resolve()
                  });
                })
              });
            })
          })
        })
        it("should handle filtered pull event handler correctly", async () => {
          const cid = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e"
          nebulus.pull(cid)
          await new Promise((resolve, reject) => {
            nebulus.on("pull:" + cid, (downloaded_cid) => {
              let filePath = STORE + "/ipfs/" + downloaded_cid
              // 1. check cid
              assert.equal(cid, downloaded_cid) 
              // 2. Check the file exists
              fs.access(filePath, fs.constants.F_OK, (err) => {
                assert(!err)
                // 3. Check the file is symbolic link
                fs.lstat(filePath, (err,stats) => {
                  assert(stats.isSymbolicLink())
                  // 4. Check the linked file exists
                  fs.readlink(filePath, (err, linkString) => {
                    assert(linkString)
                    resolve()
                  });
                })
              });
            })
          })
        })
      })
      describe("push", () => {
        it('should upload buffers correctly', async function () {
          //this.timeout(10000)
          const buffer = Buffer.from("premium pineapple pomelo seltzer with other natural flavors for depth & complexity")
          const cid = await nebulus.add(buffer)
          nebulus.push(cid)
          let actual = await new Promise((resolve, reject) => {
            nebulus.on("push", (actual) => {
              resolve(actual)
            })
          })
          assert.equal(cid, actual)
        });
        it('should replicate local folder correctly', async () => {
          let cid = await nebulus.folder({
            "aperank.png": await nebulus.add(__dirname + "/fixture/aperank/aperank.png"),
            "readme.md": await nebulus.add(__dirname + "/fixture/aperank/readme.md"),
            "index.js": await nebulus.add(__dirname + "/fixture/aperank/index.js"),
            "package.json": await nebulus.add(__dirname + "/fixture/aperank/package.json")
          })
          let files = await fs.promises.readdir(STORE + "/ipfs/" + cid)
          assert.deepEqual(files, ["aperank.png", "index.js", "package.json", "readme.md"])
          nebulus.push(cid)
          let actual = await new Promise((resolve, reject) => {
            nebulus.on("push", (actual) => {
              resolve(actual)
            })
          })
          assert.equal(cid, actual)
        })
        it("should handle filtered push event handler correctly", async () => {
          //this.timeout(10000)
          const random = Math.random().toString()
          console.log("adding", random)
          const buffer = Buffer.from(random)
          const cid = await nebulus.add(buffer)
          nebulus.push(cid)
          let actual = await new Promise((resolve, reject) => {
            nebulus.on("push:" + cid, (actual) => {
              resolve(actual)
            })
          })
          console.log("https://ipfs.io/ipfs/" + cid)
          assert.equal(cid, actual)
        })
      })
      describe("download", () => {
        it('should dowload folders correctly', async () => {
          const cid = "bafybeicaivkonz2sofegu2thshbeod3723ye2i5c5ivsyhv7gyuyunyyoq"
          nebulus.ipfs.download(cid)
          await new Promise((resolve, reject) => {
            nebulus.ipfs.on("download", (downloaded_cid) => {
              let filePath = STORE + "/ipfs/" + downloaded_cid
              // 1. check cid
              assert.equal(cid, downloaded_cid) 
              // 2. Check the file exists
              fs.access(filePath, fs.constants.F_OK, (err) => {
                assert(!err)
                // 3. Check the file is symbolic link
                fs.lstat(filePath, (err,stats) => {
                  assert(stats.isDirectory())
                  resolve()
                })
              });
            })
          })
        })
        it('should dowload files correctly', async () => {
          const cid = "bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e"
          nebulus.ipfs.download(cid)
          await new Promise((resolve, reject) => {
            nebulus.ipfs.on("download", (downloaded_cid) => {
              let filePath = STORE + "/ipfs/" + downloaded_cid
              // 1. check cid
              assert.equal(cid, downloaded_cid) 
              // 2. Check the file exists
              fs.access(filePath, fs.constants.F_OK, (err) => {
                assert(!err)
                // 3. Check the file is symbolic link
                fs.lstat(filePath, (err,stats) => {
                  assert(stats.isSymbolicLink())
                  // 4. Check the linked file exists
                  fs.readlink(filePath, (err, linkString) => {
                    assert(linkString)
                    resolve()
                  });
                })
              });
            })
          })
        })
      })
      describe("upload", () => {
        it('should upload buffers correctly', async function () {
          //this.timeout(10000)
          const buffer = Buffer.from("premium pineapple pomelo seltzer with other natural flavors for depth & complexity")
          const cid = await nebulus.add(buffer)
          nebulus.ipfs.upload(cid)
          let actual = await new Promise((resolve, reject) => {
            nebulus.ipfs.on("upload", (actual) => {
              resolve(actual)
            })
          })
          assert.equal(cid, actual)
        });
        it('should replicate local folder correctly', async () => {
          let cid = await nebulus.folder({
            "aperank.png": await nebulus.add(__dirname + "/fixture/aperank/aperank.png"),
            "readme.md": await nebulus.add(__dirname + "/fixture/aperank/readme.md"),
            "index.js": await nebulus.add(__dirname + "/fixture/aperank/index.js"),
            "package.json": await nebulus.add(__dirname + "/fixture/aperank/package.json")
          })
          let files = await fs.promises.readdir(STORE + "/ipfs/" + cid)
          assert.deepEqual(files, ["aperank.png", "index.js", "package.json", "readme.md"])
          nebulus.ipfs.upload(cid)
          let actual = await new Promise((resolve, reject) => {
            nebulus.ipfs.on("upload", (actual) => {
              resolve(actual)
            })
          })
          assert.equal(cid, actual)
        })
      })
    })
  })
});
