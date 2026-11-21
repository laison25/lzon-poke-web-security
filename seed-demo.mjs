import { readFileSync } from 'node:fs';
import { hashPassword, openStore, recordAudit, transaction, validPassword } from './store.mjs';

const source = readFileSync(new URL('./demo/tai-khoan-thanh-vien.txt', import.meta.url), 'utf8');
const accounts = [...source.matchAll(/^Thành viên (\d+)\r?\nEmail: (thanhvien\1@example\.test)\r?\nMật khẩu: ([^\r\n]+)\r?$/gm)];
if (accounts.length !== 10 || new Set(accounts.map(([, , email]) => email)).size !== 10 ||
    accounts.some(([, , , password]) => !validPassword(password))) {
  throw new Error('File phải chứa đúng 10 tài khoản thành viên demo hợp lệ.');
}

const db = openStore();
try {
  const exists = db.prepare('SELECT 1 FROM users WHERE email = ?');
  const insert = db.prepare(`INSERT INTO users (name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, 'member', ?) ON CONFLICT(email) DO NOTHING`);
  const pending = [];
  for (const [, number, email, password] of accounts) {
    if (!exists.get(email)) pending.push({ number, email, hash: await hashPassword(password) });
  }
  const created = transaction(db, () => {
    let count = 0;
    for (const { number, email, hash } of pending) {
      if (insert.run(`Thành viên ${number}`, email, hash, Date.now()).changes) {
        recordAudit(db, 'registered', null, email);
        count += 1;
      }
    }
    return count;
  });
  console.log(`Đã tạo ${created} tài khoản thành viên demo. Bỏ qua ${accounts.length - created} tài khoản đã tồn tại.`);
} finally {
  db.close();
}
