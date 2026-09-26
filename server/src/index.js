import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import jwt from 'jsonwebtoken';
import serve from 'koa-static';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const db = new Database(path.join(root, 'data', 'learning.sqlite'));
const SECRET = process.env.JWT_SECRET || 'learning-platform-secret';
db.pragma('foreign_keys = ON');
db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, lecturer TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL, students INTEGER DEFAULT 0, description TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, student_no TEXT UNIQUE NOT NULL, class_name TEXT NOT NULL, status TEXT NOT NULL, email TEXT DEFAULT '', phone TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS student_courses (student_id INTEGER NOT NULL, course_id INTEGER NOT NULL, PRIMARY KEY(student_id, course_id), FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE, FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE);`);
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) db.prepare('INSERT INTO users (username,password,name) VALUES (?,?,?)').run('admin', 'admin123', '系统管理员');
if (!db.prepare('SELECT 1 FROM courses LIMIT 1').get()) {
  const add = db.prepare('INSERT INTO courses (name,lecturer,category,status,students,description) VALUES (?,?,?,?,?,?)');
  [['React 前端工程化','林老师','前端开发','已发布',86,'从组件化到工程化实践'],['Node.js 服务端开发','周老师','后端开发','已发布',64,'使用 Koa 构建 Web 服务'],['数据结构与算法','陈老师','计算机基础','草稿',0,'面向实际问题的算法训练'],['产品设计思维','王老师','通识素养','已下架',32,'理解用户与产品价值']].forEach(item => add.run(...item));
  const addStudent = db.prepare('INSERT INTO students (name,student_no,class_name,status,email,phone) VALUES (?,?,?,?,?,?)');
  [['张小雨','S2024001','前端一班','正常','xiaoyu@example.com','13800000001'],['李明','S2024002','后端一班','正常','liming@example.com','13800000002'],['赵可','S2024003','前端一班','休学','zhaoke@example.com','13800000003'],['王晨','S2024004','产品二班','正常','wangchen@example.com','13800000004']].forEach(item => addStudent.run(...item));
}

const app = new Koa();
const router = new Router({ prefix: '/api' });
const auth = async (ctx, next) => { try { const token = ctx.headers.authorization?.replace('Bearer ', ''); ctx.state.user = jwt.verify(token, SECRET); await next(); } catch { ctx.status = 401; ctx.body = { message: '登录已过期，请重新登录' }; } };
router.post('/auth/login', ctx => { const { username, password } = ctx.request.body; const user = db.prepare('SELECT id,username,name FROM users WHERE username=? AND password=?').get(username, password); if (!user) { ctx.status = 401; ctx.body = { message: '账号或密码错误' }; return; } ctx.body = { token: jwt.sign(user, SECRET, { expiresIn: '8h' }), user }; });
router.get('/auth/me', auth, ctx => { ctx.body = ctx.state.user; });
router.get('/dashboard', auth, ctx => { const total = db.prepare('SELECT COUNT(*) count FROM courses').get().count; const published = db.prepare("SELECT COUNT(*) count FROM courses WHERE status='已发布'").get().count; const students = db.prepare('SELECT COUNT(*) count FROM students').get().count; ctx.body = { stats: { courses: total, students, publishRate: total ? Math.round(published / total * 100) : 0, activeRate: 75 }, enrollments: db.prepare('SELECT name,students FROM courses ORDER BY students DESC').all(), activity: [{ day: '周一', value: 42 }, { day: '周二', value: 58 }, { day: '周三', value: 51 }, { day: '周四', value: 73 }, { day: '周五', value: 68 }, { day: '周六', value: 82 }, { day: '周日', value: 76 }], studentStatus: db.prepare('SELECT status name,COUNT(*) value FROM students GROUP BY status').all(), categories: db.prepare('SELECT category name,COUNT(*) value FROM courses GROUP BY category').all() }; });
const listQuery = (table, fields, filters) => { const { page=1, pageSize=10, search='', status, category, sort } = filters; const where=[]; const values=[]; if (search) { where.push(`(${fields.map(f => `${f} LIKE ?`).join(' OR ')})`); fields.forEach(() => values.push(`%${search}%`)); } if (status) { where.push('status=?'); values.push(status); } if (category) { where.push('category=?'); values.push(category); } const clause=where.length ? `WHERE ${where.join(' AND ')}` : ''; const order=sort === 'students' ? 'ORDER BY students DESC' : 'ORDER BY id DESC'; const total=db.prepare(`SELECT COUNT(*) count FROM ${table} ${clause}`).get(...values).count; const rows=db.prepare(`SELECT * FROM ${table} ${clause} ${order} LIMIT ? OFFSET ?`).all(...values, Number(pageSize), (Number(page)-1)*Number(pageSize)); return { rows, total, page:Number(page), pageSize:Number(pageSize) }; };
router.get('/courses', auth, ctx => { ctx.body=listQuery('courses',['name','lecturer'],ctx.query); });
router.post('/courses', auth, ctx => { const { name, lecturer, category, status, description='' }=ctx.request.body; const result=db.prepare('INSERT INTO courses (name,lecturer,category,status,description) VALUES (?,?,?,?,?)').run(name,lecturer,category,status,description); ctx.body=db.prepare('SELECT * FROM courses WHERE id=?').get(result.lastInsertRowid); });
router.put('/courses/:id', auth, ctx => { const { name, lecturer, category, status, description='' }=ctx.request.body; db.prepare('UPDATE courses SET name=?,lecturer=?,category=?,status=?,description=? WHERE id=?').run(name,lecturer,category,status,description,ctx.params.id); ctx.body=db.prepare('SELECT * FROM courses WHERE id=?').get(ctx.params.id); });
router.delete('/courses/:id', auth, ctx => { db.prepare('DELETE FROM courses WHERE id=?').run(ctx.params.id); ctx.body={ ok:true }; });
router.get('/students', auth, ctx => { const result=listQuery('students',['name','student_no'],ctx.query); result.rows=result.rows.map(row => ({ ...row, courseIds: db.prepare('SELECT course_id FROM student_courses WHERE student_id=?').all(row.id).map(item=>item.course_id) })); ctx.body=result; });
router.post('/students', auth, ctx => { const { name, student_no, class_name, status, email='', phone='', courseIds=[] }=ctx.request.body; const insert=db.transaction(() => { const result=db.prepare('INSERT INTO students (name,student_no,class_name,status,email,phone) VALUES (?,?,?,?,?,?)').run(name,student_no,class_name,status,email,phone); const add=db.prepare('INSERT INTO student_courses VALUES (?,?)'); courseIds.forEach(id=>add.run(result.lastInsertRowid,id)); return result.lastInsertRowid; }); const id=insert(); ctx.body=db.prepare('SELECT * FROM students WHERE id=?').get(id); });
router.put('/students/:id', auth, ctx => { const { name, student_no, class_name, status, email='', phone='', courseIds=[] }=ctx.request.body; const update=db.transaction(() => { db.prepare('UPDATE students SET name=?,student_no=?,class_name=?,status=?,email=?,phone=? WHERE id=?').run(name,student_no,class_name,status,email,phone,ctx.params.id); db.prepare('DELETE FROM student_courses WHERE student_id=?').run(ctx.params.id); const add=db.prepare('INSERT INTO student_courses VALUES (?,?)'); courseIds.forEach(id=>add.run(ctx.params.id,id)); }); update(); ctx.body=db.prepare('SELECT * FROM students WHERE id=?').get(ctx.params.id); });
router.delete('/students/:id', auth, ctx => { db.prepare('DELETE FROM students WHERE id=?').run(ctx.params.id); ctx.body={ok:true}; });
router.get('/courses/options', auth, ctx => { ctx.body=db.prepare("SELECT id,name FROM courses WHERE status='已发布' ORDER BY name").all(); });
app.use(cors()).use(bodyParser()).use(router.routes()).use(router.allowedMethods());
const dist = path.resolve(root, '../client/dist'); app.use(serve(dist));
app.listen(3000, () => console.log('Server running at http://localhost:3000'));