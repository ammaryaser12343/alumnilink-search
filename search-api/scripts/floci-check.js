// Lists the six AWS resources the Search deploy creates, straight from Floci's API.
// Usage (from search-api/):  node scripts/floci-check.js
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.AWS_ENDPOINT_URL = process.env.AWS_ENDPOINT_URL || 'http://localhost:4566';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test';

const sm = require('@aws-sdk/client-secrets-manager');
const ddb = require('@aws-sdk/client-dynamodb');
const logs = require('@aws-sdk/client-cloudwatch-logs');
const iam = require('@aws-sdk/client-iam');
const lambda = require('@aws-sdk/client-lambda');
const apigw = require('@aws-sdk/client-apigatewayv2');

async function check(name, fn) {
  try {
    const found = await fn();
    console.log(`${found ? 'OK     ' : 'MISSING'}  ${name}${found ? ': ' + found : ''}`);
  } catch (error) {
    console.log(`ERROR    ${name}: ${error.name} ${error.message}`);
  }
}

(async () => {
  console.log(`Floci at ${process.env.AWS_ENDPOINT_URL}\n`);
  await check('1 Secrets Manager', async () => (await new sm.SecretsManagerClient({}).send(new sm.DescribeSecretCommand({ SecretId: 'alumnilink/search' }))).Name);
  await check('2 DynamoDB', async () => (await new ddb.DynamoDBClient({}).send(new ddb.DescribeTableCommand({ TableName: 'alumnilink-search-ratelimit' }))).Table.TableName);
  await check('3 CloudWatch Logs', async () => (await new logs.CloudWatchLogsClient({}).send(new logs.DescribeLogGroupsCommand({ logGroupNamePrefix: '/aws/lambda/alumnilink-search' }))).logGroups.map((g) => g.logGroupName).join(', ') || null);
  await check('4 IAM', async () => (await new iam.IAMClient({}).send(new iam.GetRoleCommand({ RoleName: 'alumnilink-search-role' }))).Role.RoleName);
  await check('5 Lambda', async () => (await new lambda.LambdaClient({}).send(new lambda.GetFunctionCommand({ FunctionName: 'alumnilink-search' }))).Configuration.FunctionName);
  await check('6 API Gateway', async () => (await new apigw.ApiGatewayV2Client({}).send(new apigw.GetApisCommand({}))).Items.map((a) => `${a.Name} (${a.ApiId})`).join(', ') || null);
})();
