import type { IExecuteFunctions, IDataObject } from 'n8n-workflow';
import { buildEnvelope, sendSoap, parseXml, extractResultBase } from '../core/soap';
import { throwForSoapFaultOrStatus } from '../core/errors';

const API_ENDPOINT = 'PlunetAPI.asmx'; // adjust if repo uses a different path
const SOAP_NS = 'http://www.plunet.com/';

function baseUrl(this: IExecuteFunctions): string {
  const raw = this.getNodeParameter('baseUrl', 0) as string; // adjust param/cred source if needed
  return raw.replace(/\/+$/, '');
}
function apiUrl(this: IExecuteFunctions) {
  return `${baseUrl.call(this)}/${API_ENDPOINT}`;
}
function soapAction(op: string) {
  return `${SOAP_NS}${op}`;
}

export async function ensureSession(this: IExecuteFunctions): Promise<string> {
  const store = this.getWorkflowStaticData('node') as IDataObject;
  let session = (store.sessionUuid as string) || '';

  if (session) {
    try { if (await validate.call(this, session)) return session; } catch {}
  }
  session = await login.call(this);
  store.sessionUuid = session;
  return session;
}

async function login(this: IExecuteFunctions): Promise<string> {
  const username = this.getNodeParameter('username', 0) as string; // or pull from credentials
  const password = this.getNodeParameter('password', 0) as string;

  const body = `<username>${escapeXml(username)}</username><password>${escapeXml(password)}</password>`;
  const envelope = buildEnvelope('login', body);
  const xml = await sendSoap(this, apiUrl.call(this), soapAction('login'), envelope);
  const x = parseXml(xml);
  const { statusCode, statusMessage } = extractResultBase(x);
  throwForSoapFaultOrStatus(x, 'login', apiUrl.call(this), soapAction('login'), envelope, statusCode, statusMessage);

  const result =
    x?.['soap:Envelope']?.['soap:Body']?.loginResponse?.loginResult ??
    x?.Envelope?.Body?.loginResponse?.loginResult;
  if (typeof result === 'string' && result) return result;
  throw new Error('Login did not return a session id');
}

async function validate(this: IExecuteFunctions, session: string): Promise<boolean> {
  const envelope = buildEnvelope('validate', `<session>${escapeXml(session)}</session>`);
  const xml = await sendSoap(this, apiUrl.call(this), soapAction('validate'), envelope);
  const x = parseXml(xml);
  const { statusCode } = extractResultBase(x);
  return statusCode === 0;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
