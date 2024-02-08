var express = require("express");
var router = express.Router();
var pdfRouter = require("./pdf");

//api
router.use("/pdf", pdfRouter);

router.get("/", function (req, res, next) {
  res.status(500).send("없는 api"); //책 속의 한 줄
});

module.exports = router;
