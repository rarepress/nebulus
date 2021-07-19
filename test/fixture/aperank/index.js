require('dotenv').config()
const express = require('express')
const fs = require('fs')
const Datastore = require('nedb')
const path = require('path')
const basepath = process.env.APEBASE ? process.env.APEBASE : process.cwd()
const stats = require("./stats.json")
const ratio = require("./ratio.json")
class Server {
  constructor () {
    this.app = express()
  }
  async start () {
    console.log("starting server..")
    this.db = new Datastore({ filename: "./rank", autoload: true });
    this.app.set('view engine', 'ejs');
    this.app.get("/ipfs/:cid", (req, res) => {
      res.sendFile(path.resolve(basepath, "ipfs/" + req.params.cid))
    })
    this.app.use(express.static('public'))
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json())
    this.app.get("/", async (req, res) => {
      let q = {}
      let page = (req.query && req.query.page ? req.query.page : 0)
      this.db.find(q).sort({ calculated: 1 }).limit(20).skip(page * 20).exec((err, docs) => {
        docs.forEach(this.transformImage)
        if (page > 0) {
          res.render("partial", { ratio, stats, items: docs })
        } else {
          res.render("index", {
            ratio: ratio,
            stats: stats,
            items: docs,
          })
        }
      })
    })
    this.app.get("/token/:id", (req, res) => {
      this.db.findOne({
        id: req.params.id
      }, (err, doc) => {
        this.transformImage(doc)
        res.render("token", {
          tweet: "https://aperank.offbase.org/token/" + doc.rank,
          ratio: ratio,
          stats: stats,
          item: doc
        })
      })
    })
    this.app.listen(3011)
  }
  transformImage (doc) {
    if (doc.metadata.image.startsWith("Qm")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image
    } else if (doc.metadata.image.startsWith("/ipfs")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image.slice(5)
    } else if (doc.metadata.image.startsWith("ipfs://ipfs")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image.slice(12)
    } else if (doc.metadata.image.startsWith("ipfs://")) {
      doc.metadata.image = "/ipfs/" + doc.metadata.image.slice(7)
    }
  }
};
new Server().start();

