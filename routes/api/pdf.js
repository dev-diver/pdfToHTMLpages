var express = require("express");
var router = express.Router();
const multer = require("multer");
const DEST = "uploads/";
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const pdftohtml = require("pdftohtmljs");
const { s3, s3Upload, BUCKET_NAME } = require("../../config/aws");
require("dotenv").config();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, DEST); // 'name'을 경로에 포함
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, req.name);
  },
});

const upload = multer({ storage: storage });

router.route("/").post(upload.single("file"), async function (req, res) {
  const { name } = req.body;
  const file = req.file;
  if (file) {
    //s3에 업로드
    console.log("File received: ", file);
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: `pdfs/${name}/${name}.pdf`,
      Body: fs.createReadStream(file.path),
    };
    console.log("uploadParams:", uploadParams);
    s3Upload(uploadParams)
      .promise()
      .catch((err) => {
        console.error(err);
      });
  } else {
    res.status(400).send("No file received");
  }

  const uploadingPdfPath = path.join(__dirname, DEST, `${name}.pdf`);
  const data = await fs.promises.readFile(uploadingPdfPath);
  const readPdf = await PDFDocument.load(data);
  const { pageLength } = readPdf.getPages();

  const pdfOutputPath = path.join(__dirname, DEST, "pdf", name);
  const htmlOutputPath = path.join(__dirname, DEST, "html", name);

  await convert(pdfOutputPath, htmlOutputPath);

  try {
    for (let pageNum = 0, n = pageLength; pageNum < n; pageNum += 1) {
      const htmlFileName = `${name}_${pageNum}.page`;
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: `pdfs/${name}/${htmlFileName}`,
        Body: fs.createReadStream(htmlFileName),
      };
      s3Upload(uploadParams)
        .promise()
        .catch((err) => {
          console.error(err);
        });
      await removeFile(path.join(htmlOutputPath, htmlFileName));
    }
    await removeFile(uploadingPdfPath);
    return res.json({
      isSuccess: true,
      message: "pdf 업로드 성공",
    });
  } catch (err) {
    console.log(`App - post pdf info Query error\n: ${err}`);
    return res.status(500).json({
      isSuccess: false,
      message: "pdf 업로드 실패",
    });
  }
});

const convert = async (file, outputPath, fileName) => {
  const converter = new pdftohtml(file);
  converter.progress((ret) => {
    const progress = (ret.current * 100.0) / ret.total;
    console.log(`${progress} %`);
  });

  try {
    await converter.add_options([
      `--embed cFIjO`,
      `--split-pages 1`,
      `--dest-dir ${outputPath}`,
      `--page-filename ${fileName}_%d.page`,
    ]);
    await converter.convert();
  } catch (err) {
    console.error(`변경 중에 오류가 있었습니다.: ${err.msg}`);
  }
};

const removeFile = async (fileDirectory) => {
  fs.unlink(fileDirectory, (err) =>
    err
      ? console.log(err)
      : console.log(`${fileDirectory} 를 정상적으로 삭제했습니다`)
  );
};
