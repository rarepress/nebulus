const { importer } = require('ipfs-unixfs-importer')
const BufferListStream = require('bl')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const axios = require('axios');
const IPFS = require('ipfs-core')
const exitHook = require('async-exit-hook');
const CancelToken = axios.CancelToken;
const { v4: uuidv4 } = require('uuid');
class CID {
  constructor() {
    this.block = {
      get: async cid => { throw new Error(`unexpected block API get for ${cid}`) },
      put: async () => { throw new Error('unexpected block API put') }
    }
    this.folderOptions = {
      onlyHash: true,
      cidVersion: 1,
      rawLeaves: true,
      wrapWithDirectory: true
    }
    this.fileOptions = {
      onlyHash: true,
      cidVersion: 1,
      rawLeaves: true,
    }
  }
  async folder (content) {
    let lastCid
    for await (const entry of importer(content, this.block, this.folderOptions)) {
      lastCid = entry.cid
    }
    return `${lastCid}`
  }
  async file (content) {
    let lastCid
    for await (const { cid } of importer([{ content }], this.block, this.fileOptions)) {
      lastCid = cid
    }
    return `${lastCid}`
  }
}
class Network {
  constructor({ parent, cid, storage }) {
    this.cid = cid
    this.events = {}
    this.storage = storage
    this.parent = parent
  }
  on (event, callback) {
    this.events[event] = callback
  }
  async start() {
    this.ipfs = await IPFS.create({repo: `${this.storage}/repo` })
    exitHook((callback) => {
      this.ipfs.stop().then(() => {
        console.log("IPFS Stoppped")
        callback();
      })
    });
  }
  async stop() {
    await this.ipfs.stop()
  }
  async download(cid) {
    let folder = null;
    let mapping = {}
    let files = []
    for await (const file of this.ipfs.get(cid)) {
      if (file.type === 'file') {
        files.push(file)
      } else if (file.type === 'dir') {
        folder = file
      }
    }
    for(let file of files) {
      mapping[file.name] = file.cid.toString()  
      const content = new BufferListStream()
      for await (const chunk of file.content) {
        content.append(chunk)
      }
      // 1. download as uuid filename
      const id = uuidv4()
      const oldPath = `${this.storage}/src/${id}`
      let newCid = await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(oldPath)
        writeStream.on('finish', async () => {
          // 2. update the name to a content addressable filename
          let buf = await fs.promises.readFile(oldPath)
          const sha256 = crypto.createHash('sha256').update(buf).digest("hex")
          const newPath = `${this.storage}/src/${sha256}`
          await fs.promises.rename(oldPath, newPath)
          // 3. create an IPFS symbolic link
          const cid = await this.parent.add(newPath)
          resolve(cid)
        })
        writeStream.on("error", (e) => {
          throw e
        })
        content.pipe(writeStream)
      })
    }
    if (folder) {
      await this.parent.folder(mapping)
    }
    if (this.events.download) this.events.download(cid)
  }
  async upload(cid) {
    if (!this.ipfs) {
      throw new Error("ipfs network not initialized yet")
      return
    }
    const filePath = `${this.storage}/ipfs/${cid}`
    const stat = await fs.promises.lstat(filePath);
    let isDirectory = stat.isDirectory()
    let res
    if (isDirectory) {
      const filenames = await fs.promises.readdir(filePath)
      for(let filename of filenames) {
        let content = await fs.promises.readFile(filePath + "/" + filename)
        let res = await this.ipfs.add(content, {
          create: true,
          cidVersion: 1,
          rawLeaves: true,
        })
        await this.ipfs.files.rm("/" + filename).catch((e) => {})
        await this.ipfs.files.cp(res.cid, "/" + filename, { cidVersion: 1, }).catch((e) => {})
      }
      const directoryStatus = await this.ipfs.files.stat('/')
      for(let filename of filenames) {
        console.log("checking", filename)
        await this.check(directoryStatus.cid.toString() + "/" + filename)
        console.log("found", filename)
      }
      res = directoryStatus
    } else {
      const data = await fs.promises.readFile(filePath)
      console.log("adding to ipfs...")
      res = await this.ipfs.add(data, {
        create: true,
        cidVersion: 1,
        rawLeaves: true,
      })
      await this.check(res.cid.toString())
    }
    if (this.events.upload) this.events.upload(res.cid.toString())
  }
  async check(cid) {
    while(true) {
      try {
        let res = await axios.get("https://ipfs.io/ipfs/" + cid, { timeout: 2000 })
        console.log("success")
        break;
      } catch (e) {
        console.log("timeout. not yet replicated:", cid)
        await new Promise((resolve, reject) => {
          setTimeout(() => {
            resolve()
          }, 1000)
        })
        console.log("retrying...")
      }
    }
  }
}
class Nebulus {
  constructor(options) {
    this.storage = (options && options.path ? options.path : ".nebulus")
    this.max = (options && options.max ? options.max : null)
    this.cid = new CID()
    this.ipfs = new Network({
      parent: this,
      storage: this.storage,
      cid: this.cid
    })
    try { fs.mkdirSync(this.storage, { recursive: true }) } catch (e) {} 
    try { fs.mkdirSync(`${this.storage}/src`, { recursive: true }) } catch (e) {}
    try { fs.mkdirSync(`${this.storage}/ipfs`, { recursive: true }) } catch (e) {}
  }
  download(url) {
    return this.import(url)
  }
  async import(url) {
    const id = uuidv4()
    const oldPath = `${this.storage}/src/${id}`
    const source = CancelToken.source();
    const { data, headers } = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      cancelToken: source.token
    })
    const fileSize = headers['content-length']
    // if file size is larger than "this.max" MB, error
    if (this.max && fileSize > this.max * 1000 * 1000) {
      const error = `file size too large: ${fileSize/1000/1000}MB. max allowed size: ${this.max}MB`
      source.cancel(error)
      throw new Error(error)
    } else {
      let cid = await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(oldPath)
        writeStream.on('finish', async () => {
          let buf = await fs.promises.readFile(oldPath)
          const sha256 = crypto.createHash('sha256').update(buf).digest("hex")
          const newPath = `${this.storage}/src/${sha256}`
          await fs.promises.rename(oldPath, newPath)
          const cid = await this.add(newPath)
          resolve(cid)
        });
        data.pipe(writeStream).on('error', (e) => {
          reject(e)
        })
      })
      return cid;
    }
  }
  async add(o) {
    /**********************************
    *  o := <buffer> | <string>
    *
    * if <buffer>, add buffer directly
    * if <string>, it's a file path
    *
    **********************************/
    let filePath;
    if (Buffer.isBuffer(o)) {
      // buffer. create a buffer file
      const sha256 = crypto.createHash('sha256').update(o).digest("hex")
      filePath = `${this.storage}/src/${sha256}`
      await fs.promises.writeFile(filePath, o)
    } else {
      // file path
      filePath = o;
    }

    if (filePath.startsWith("http")) {
      let cid = await this.import(filePath)
      return cid
    } else {
      const buf = await fs.promises.readFile(filePath)
      let cid = await this.cid.file(buf)
      const relativePath = path.relative(
        `${this.storage}/ipfs`,
        filePath,
      )
      await fs.promises.symlink(relativePath, `${this.storage}/ipfs/${cid}`, 'file').catch((e) => {})
      return cid
    }
  }
  async folder(mapping) {
    /*************************************************************
    *
    *  mapping := {
    *    <filename1>: <cid1>,
    *    <filename2>: <cid2>,
    *    ...
    *  }
    *
    *************************************************************/
    let filepaths = Object.keys(mapping)
    let source = filepaths.map((filepath) => {
      let cid = mapping[filepath]
      return {
        path: filepath,
        content: fs.createReadStream(`${this.storage}/ipfs/${cid}`)
      }
    })
    // get top level hash
    const roothash = await this.cid.folder(source)
    for(let filepath of filepaths) {
      // 1. create folder if it doesn't exist yet
      let cid = mapping[filepath]
      let target = `${this.storage}/ipfs/${cid}`
      let dir = `${this.storage}/ipfs/${roothash}/${path.dirname(filepath)}`
      let linkPath = `${this.storage}/ipfs/${roothash}/${filepath}`
      await fs.promises.mkdir(dir, { recursive: true }).catch((e) => {})
      // the symlink will point to a relative path instead of absolute.
      // Get the relative path of the target relative to the source
      const targetRelativePath = path.relative(dir, target)
      // 2. create symbolic link from ipfs cid to source file
      await fs.promises.symlink(targetRelativePath, linkPath, 'file').catch((e) => {})
    }
    return roothash
  }
  stream(cid) {
    return fs.createReadStream(`${this.storage}/ipfs/${cid}`)
  }
  get(cid, encoding) {
    return fs.promises.readFile(`${this.storage}/ipfs/${cid}`, encoding)
  }
}
module.exports = Nebulus
