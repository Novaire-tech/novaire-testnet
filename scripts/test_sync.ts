import * as fs from 'fs';
import * as path from 'path';
import { saveDeployments } from './utils';

const mockDeployments = { "test": "123" };
saveDeployments(__dirname, mockDeployments);

const f1 = fs.readFileSync(path.resolve(__dirname, 'deployments.testnet.json'), 'utf-8');
const f2 = fs.readFileSync(path.resolve(__dirname, '../src/config/deployments.testnet.json'), 'utf-8');

console.log('Scripts JSON:', f1);
console.log('Frontend JSON:', f2);
console.log('Synchronized:', f1 === f2);
