import { isAbsolute } from 'node:path';
import { createResendTransport } from './mail.mjs';
export function loadConfiguration(env=process.env) {
 const databasePath=env.BARCODE_MEMBER_DATABASE_PATH;
 if(!databasePath||!isAbsolute(databasePath))throw new Error('BARCODE_MEMBER_DATABASE_PATH must be absolute');
 if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32)throw new Error('BETTER_AUTH_SECRET must contain at least 32 private characters');
 if(!env.BARCODE_MEMBER_SERVICE_TOKEN||env.BARCODE_MEMBER_SERVICE_TOKEN.length<32)throw new Error('BARCODE_MEMBER_SERVICE_TOKEN must contain at least 32 private characters');
 return {databasePath,baseURL:'https://www.barcode-network.com/api/member/auth',secret:env.BETTER_AUTH_SECRET,serviceToken:env.BARCODE_MEMBER_SERVICE_TOKEN,sender:'BARCODE Network <accounts@mail.barcode-network.com>',replyTo:'thebarcodenetwork@gmail.com',transport:createResendTransport(env.RESEND_API_KEY)};
}
