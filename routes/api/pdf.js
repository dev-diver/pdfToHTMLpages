var express = require("express");
var router = express.Router();
const multer = require("multer");
const DEST = "uploads";
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const pdftohtml = require("pdftohtmljs");
const { s3, s3Upload, BUCKET_NAME } = require("../../config/aws");
require("dotenv").config();

// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     console.log(req);
//     const uploadPath = path.join(__dirname, DEST, "pdf", req.fileName);
//     cb(null, uploadPath);
//   },
//   filename: function (req, file, cb) {
//     cb(null, req.fileName);
//   },
// });

const upload = multer({ dest: path.join(DEST, "pdf") });

router.route("/").post(upload.single("file"), async function (req, res) {
  const file = req.file;
  const fileName = req.body.fileName;
  if (file) {
    //s3에 업로드
    console.log("File received: ");
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: `pdfs/${fileName}/${fileName}.pdf`,
      Body: fs.createReadStream(file.path),
    };
    s3Upload(uploadParams).catch((err) => {
      console.error(err);
    });
  } else {
    res.status(400).send("No file received");
  }

  const uploadingPdfFilePath = file.path;

  const data = await fs.promises.readFile(uploadingPdfFilePath);
  const readPdf = await PDFDocument.load(data);
  const { length } = readPdf.getPages();
  const pageLength = length;

  const htmlOutputDirPath = path.join(DEST, "html", fileName);
  console.log("uploadingPdfPath:", uploadingPdfFilePath);
  console.log("htmlOutputPath:", htmlOutputDirPath);
  try {
    const convertSuccess = await convert(
      uploadingPdfFilePath,
      htmlOutputDirPath,
      fileName
    );
    console.log("convert completed");
    console.log("pageLength:", pageLength);
    if (!convertSuccess) {
      throw new Error("PDF 변환 실패");
    }
    for (let pageNum = 0, n = pageLength; pageNum < n; pageNum += 1) {
      const htmlFileName = `${fileName}_${pageNum}.page`;
      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: `pdfs/${fileName}/${htmlFileName}`,
        Body: fs.createReadStream(htmlFileName),
      };
      try {
        await s3Upload(uploadParams);
      } catch (err) {
        console.error(err);
      }
      const removeFilePath = path.join(htmlOutputDirPath, htmlFileName);
      console.log("removeFilePath:", removeFilePath);
      await removeFile(removeFilePath);
    }
    // await removeFile(uploadingPdfFilePath);
    return res.json({
      isSuccess: true,
      message: "pdf 업로드 성공",
    });
  } catch (err) {
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
    console.error(`변환 성공`);
    return true;
  } catch (err) {
    console.error(`변경 중에 오류가 있었습니다.: ${err}`);
    return false;
  }
};

const removeFile = async (fileDirectory) => {
  fs.unlink(fileDirectory, (err) =>
    err
      ? console.log(err)
      : console.log(`${fileDirectory} 를 정상적으로 삭제했습니다`)
  );
};

module.exports = router;
