var express = require("express");
var router = express.Router();
const multer = require("multer");
const DEST = "uploads";
const fs = require("fs");
const path = require("path");
const util = require("util");

const { PDFDocument } = require("pdf-lib");
const pdftohtml = require("pdftohtmljs");
const { s3, s3Upload, BUCKET_NAME } = require("../../config/aws");
require("dotenv").config();

const upload = multer({ dest: path.join(DEST, "pdf") });
const renameFile = util.promisify(fs.rename);

router.route("/").post(upload.single("file"), async function (req, res) {
  const file = req.file;
  const fileName = req.body.fileName;
  const tempPath = req.file?.path;
  const newExtension = path.extname(req.file?.originalname);
  const newPath = path.join("uploads/pdf", `${fileName}${newExtension}`);
  await renameFile(tempPath, newPath);
  let location;
  if (file) {
    //s3에 업로드
    console.log("File received: ", file.path);

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: `pdfs/${fileName}/${fileName}.pdf`,
      Body: fs.createReadStream(newPath),
    };
    await s3Upload(uploadParams)
      .then((data) => {
        location = data.Location;
        location = changePdfToHtml(location);
      })
      .catch((err) => {
        console.error(err);
      });
  } else {
    res.status(400).send("No file received");
  }

  const uploadingPdfFilePath = newPath;

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
    if (!convertSuccess) {
      console.log("convert failed");
      throw new Error("PDF 변환 실패");
    }
    console.log("convert completed");
    console.log("pageLength:", pageLength);

    const S3KeyPath = path.join("pdfs", fileName);

    //html, css 업로드
    const coverFileName = `cover.jpg`;
    const htmlFileName = `${fileName}.html`;
    const cssFileName = `${fileName}.css`;
    uploadS3(DEST, S3KeyPath, coverFileName, false);
    uploadS3(htmlOutputDirPath, S3KeyPath, htmlFileName);
    uploadS3(htmlOutputDirPath, S3KeyPath, cssFileName);

    //page 업로드
    for (let pageNum = 1; pageNum <= pageLength; pageNum++) {
      const pageFileName = `${fileName}_${pageNum}.page`;
      uploadS3(htmlOutputDirPath, S3KeyPath, pageFileName);
    }

    const removeList = [
      "pdf2htmlEX.min.js",
      "fancy.min.css",
      "compatibility.min.js",
      "base.min.css",
    ];
    removeList.forEach((file) => {
      removeFile(path.join(htmlOutputDirPath, file));
    });
    removeFile(uploadingPdfFilePath);

    console.log("업로드 완료");
    return res.json({
      isSuccess: true,
      message: "pdf 업로드 성공",
      fileName: fileName,
      location: location,
    });
  } catch (err) {
    console.error(err);
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

const uploadS3 = async (
  localDirectory,
  KeyDirectory,
  fileNameWithExtend,
  deleteOrigin = true
) => {
  const KeyFilePath = path.join(KeyDirectory, fileNameWithExtend);
  const LocalFilePath = path.join(localDirectory, fileNameWithExtend);

  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: KeyFilePath,
    Body: fs.createReadStream(LocalFilePath),
  };
  try {
    await s3Upload(uploadParams)
      .then((data) => {
        console.error("s3 업로드 성공", data.Location);
      })
      .catch((err) => {
        console.error(err);
      });
  } catch (err) {
    console.error("s3 업로드 실패", err);
  }
  if (deleteOrigin) {
    await removeFile(LocalFilePath);
  }
};

function changePdfToHtml(url) {
  if (!url.endsWith(".pdf")) {
    throw new Error("URL does not end with .pdf");
  }
  return url.substring(0, url.lastIndexOf(".pdf")) + ".html";
}

module.exports = router;
