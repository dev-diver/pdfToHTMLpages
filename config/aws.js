const AWS = require("aws-sdk");

const REGION = process.env.S3_REGION;
const ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY_ID = process.env.S3_SECRET_ACCESS_KEY_ID;
exports.BUCKET_NAME = process.env.S3_BUCKET_NAME;

// const s3 = new AWS.S3({
//   accessKeyId: ACCESS_KEY_ID,
//   secretAccessKey: SECRET_ACCESS_KEY_ID,
//   region: REGION, // 예: 'us-east-1'
// });

// exports.s3 = new AWS.S3({
//   accessKeyId: ACCESS_KEY_ID,
//   secretAccessKey: SECRET_ACCESS_KEY_ID,
//   region: REGION, // 예: 'us-east-1'
// });

AWS.config.update({
  region: REGION,
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY_ID,
});

exports.s3Upload = (uploadParams) => {
  return new AWS.S3.ManagedUpload({ params: uploadParams });
};

// exports.s3 = s3;

// exports.s3Upload = (uploadParams) => {
//   return s3.upload(uploadParams).promise();
// };
