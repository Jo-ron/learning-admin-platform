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
CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, lecturer TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL, students INTEGER DEFAULT 0, description TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP, cancel_reason TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, student_no TEXT UNIQUE NOT NULL, class_name TEXT NOT NULL, status TEXT NOT NULL, email TEXT DEFAULT '', phone TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS student_courses (student_id INTEGER NOT NULL, course_id INTEGER NOT NULL, PRIMARY KEY(student_id, course_id), FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE, FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT DEFAULT '', department TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'active', bio TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS enrollments (enrollment_id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, course_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'studying', note TEXT DEFAULT '', enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP, cancel_reason TEXT DEFAULT '', FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE, FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS operation_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, operation_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, operator_name TEXT NOT NULL, operation_type TEXT NOT NULL, object_type TEXT NOT NULL, object_name TEXT NOT NULL, change_summary TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT, publisher_name TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS tracking_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_name TEXT NOT NULL, event_type TEXT NOT NULL DEFAULT 'page', user_id INTEGER, session_id TEXT, page_path TEXT, event_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, payload TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
if (!db.prepare('PRAGMA table_info(courses)').all().some(column => column.name === 'instructor_id')) db.exec('ALTER TABLE courses ADD COLUMN instructor_id INTEGER');
if (!db.prepare('PRAGMA table_info(courses)').all().some(column => column.name === 'cancel_reason')) db.exec("ALTER TABLE courses ADD COLUMN cancel_reason TEXT DEFAULT ''");
if (!db.prepare('PRAGMA table_info(enrollments)').all().some(column => column.name === 'cancel_reason')) db.exec("ALTER TABLE enrollments ADD COLUMN cancel_reason TEXT DEFAULT ''");
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) db.prepare('INSERT INTO users (username,password,name) VALUES (?,?,?)').run('admin', process.env.ADMIN_PASSWORD || 'admin123', '系统管理员');
if (!db.prepare('SELECT 1 FROM courses LIMIT 1').get()) {
  const add = db.prepare('INSERT INTO courses (name,lecturer,category,status,students,description) VALUES (?,?,?,?,?,?)');
  [['React 前端工程化','林老师','前端开发','已发布',86,'从组件化到工程化实践'],['Node.js 服务端开发','周老师','后端开发','已发布',64,'使用 Koa 构建 Web 服务'],['数据结构与算法','陈老师','计算机基础','草稿',0,'面向实际问题的算法训练'],['产品设计思维','王老师','通识素养','已下架',32,'理解用户与产品价值']].forEach(item => add.run(...item));
  const addStudent = db.prepare('INSERT INTO students (name,student_no,class_name,status,email,phone) VALUES (?,?,?,?,?,?)');
  [['张小雨','S2024001','前端一班','正常','xiaoyu@example.com','13800000001'],['李明','S2024002','后端一班','正常','liming@example.com','13800000002'],['赵可','S2024003','前端一班','休学','zhaoke@example.com','13800000003'],['王晨','S2024004','产品二班','正常','wangchen@example.com','13800000004']].forEach(item => addStudent.run(...item));
}
const lecturerTeachers = [
  { name: '林老师', phone: '000-0000-0104', department: '前端教研组', bio: '负责前端课程教研与授课' },
  { name: '周老师', phone: '000-0000-0105', department: '后端教研组', bio: '负责服务端与数据库课程' },
  { name: '陈老师', phone: '000-0000-0106', department: '计算机基础组', bio: '负责计算机基础课程' },
  { name: '王老师', phone: '000-0000-0107', department: '产品与设计组', bio: '负责产品与通识课程' },
];
for (const teacher of lecturerTeachers) {
  const existing = db.prepare('SELECT id FROM teachers WHERE name=?').get(teacher.name);
  if (existing) {
    db.prepare("UPDATE teachers SET phone=?, department=?, bio=? WHERE id=? AND (phone IS NULL OR phone='')").run(teacher.phone, teacher.department, teacher.bio, existing.id);
  } else {
    db.prepare('INSERT INTO teachers (name,phone,department,status,bio) VALUES (?,?,?,?,?)').run(teacher.name, teacher.phone, teacher.department, 'active', teacher.bio);
  }
}
db.prepare("INSERT INTO teachers (name, status) SELECT DISTINCT lecturer, 'active' FROM courses WHERE lecturer NOT IN (SELECT name FROM teachers) AND lecturer <> ''").run();
db.prepare('UPDATE courses SET instructor_id=(SELECT id FROM teachers WHERE teachers.name=courses.lecturer LIMIT 1) WHERE instructor_id IS NULL').run();
if (!db.prepare('SELECT 1 FROM enrollments LIMIT 1').get()) {
  const addEnrollment = db.prepare("INSERT INTO enrollments (student_id, course_id, status, note) SELECT ?, id, 'studying', '' FROM courses WHERE status='已发布' ORDER BY id LIMIT 1");
  db.prepare('SELECT id FROM students ORDER BY id LIMIT 3').all().forEach(student => addEnrollment.run(student.id));
  db.prepare("UPDATE courses SET students=(SELECT COUNT(*) FROM enrollments WHERE enrollments.course_id=courses.id AND enrollments.status NOT IN ('dropped','cancelled'))").run();
}
if (!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('extended_demo_data_v1')) {
  const seedExtendedDemoData = db.transaction(() => {
    const teacherSpecs = [
      { name: '演示教师-唐', phone: '000-0000-0101', department: '数据科学组', status: 'active', bio: '演示教师资料' },
      { name: '演示教师-许', phone: '000-0000-0102', department: '教学运营组', status: 'active', bio: '演示教师资料' },
      { name: '演示教师-何', phone: '000-0000-0103', department: '课程研发组', status: 'inactive', bio: '演示离职教师，用于状态筛选' },
    ];
    for (const teacher of teacherSpecs) {
      if (!db.prepare('SELECT 1 FROM teachers WHERE name=?').get(teacher.name)) {
        db.prepare('INSERT INTO teachers (name,phone,department,status,bio) VALUES (?,?,?,?,?)').run(teacher.name,teacher.phone,teacher.department,teacher.status,teacher.bio);
      }
    }

    const courseSpecs = [
      { name: 'Vue 3 管理界面实战', lecturer: '林老师', category: '前端开发', status: '已发布', description: '使用 Vue 3 构建组件化管理页面' },
      { name: 'Python 数据分析入门', lecturer: '演示教师-唐', category: '数据科学', status: '已发布', description: '从表格清洗到基础可视化' },
      { name: '关系型数据库设计', lecturer: '周老师', category: '数据库', status: '已发布', description: '练习表结构设计、约束与查询' },
      { name: 'Linux 运维基础', lecturer: '演示教师-许', category: '运维', status: '已发布', description: '学习常用命令、服务与日志管理' },
      { name: '产品原型与用户研究', lecturer: '王老师', category: '通识素养', status: '已发布', description: '从需求梳理到低保真原型' },
      { name: 'Docker 容器化部署', lecturer: '周老师', category: '工具', status: '草稿', description: '容器镜像、网络与部署流程' },
      { name: '前端自动化测试', lecturer: '林老师', category: '前端开发', status: '已下架', description: '组件测试与持续集成基础' },
    ];
    const courseIds = new Map();
    for (const course of courseSpecs) {
      let row = db.prepare('SELECT id FROM courses WHERE name=?').get(course.name);
      if (!row) {
        const teacher = db.prepare('SELECT id FROM teachers WHERE name=?').get(course.lecturer);
        const result = db.prepare('INSERT INTO courses (name,lecturer,instructor_id,category,status,description) VALUES (?,?,?,?,?,?)').run(course.name,course.lecturer,teacher?.id || null,course.category,course.status,course.description);
        row = { id: result.lastInsertRowid };
      }
      courseIds.set(course.name, row.id);
    }

    const classNames = ['前端二班','后端二班','数据二班','产品一班'];
    const students = [];
    const addStudent = db.prepare('INSERT INTO students (name,student_no,class_name,status,email,phone) VALUES (?,?,?,?,?,?)');
    for (let index = 1; index <= 16; index += 1) {
      const studentNo = `DEMO26-${String(index).padStart(3,'0')}`;
      let student = db.prepare('SELECT id FROM students WHERE student_no=?').get(studentNo);
      if (!student) {
        const suffix = String(index).padStart(2,'0');
        const result = addStudent.run(`演示学员${suffix}`,studentNo,classNames[(index-1)%classNames.length],index % 7 === 0 ? '休学' : '正常',`demo-student-${suffix}@example.invalid`,`000-0000-${String(200+index)}`);
        student = { id: result.lastInsertRowid };
      }
      students.push(student);
    }

    const publishedCourses = courseSpecs.filter(course => course.status === '已发布').map(course => courseIds.get(course.name));
    const insertProfileCourse = db.prepare('INSERT OR IGNORE INTO student_courses (student_id,course_id) VALUES (?,?)');
    const insertEnrollment = db.prepare('INSERT INTO enrollments (student_id,course_id,status,note) VALUES (?,?,?,?)');
    const hasEnrollment = db.prepare('SELECT 1 FROM enrollments WHERE student_id=? AND course_id=? LIMIT 1');
    const enrollmentStatuses = ['studying','studying','completed','studying','dropped','studying'];
    const addSampleEnrollment = (student, courseId, status) => {
      insertProfileCourse.run(student.id,courseId);
      if (!hasEnrollment.get(student.id,courseId)) insertEnrollment.run(student.id,courseId,status,'演示数据');
    };
    students.forEach((student,index) => {
      addSampleEnrollment(student,publishedCourses[index%publishedCourses.length],enrollmentStatuses[index%enrollmentStatuses.length]);
      if (index < 8) addSampleEnrollment(student,publishedCourses[(index+2)%publishedCourses.length],index%3===0?'completed':'studying');
    });
    for (const courseId of publishedCourses) {
      db.prepare("UPDATE courses SET students=(SELECT COUNT(*) FROM enrollments WHERE course_id=? AND status NOT IN ('dropped','cancelled')) WHERE id=?").run(courseId,courseId);
    }

    const admin = db.prepare("SELECT name FROM users WHERE username='admin'").get();
    const announcements = [
      { title: '演示公告：本周课程安排', content: '这是演示公告，用于展示公告列表与发布状态。', status: 'published' },
      { title: '演示公告：学习资料更新', content: '课程资料更新示例，请以课程页面实际内容为准。', status: 'published' },
      { title: '演示公告：期中项目提交提醒', content: '草稿状态示例，不代表真实提交安排。', status: 'draft' },
      { title: '演示公告：假期开放时间', content: '已下线状态示例，不代表机构实际开放时间。', status: 'offline' },
    ];
    for (const announcement of announcements) {
      if (!db.prepare('SELECT 1 FROM announcements WHERE title=?').get(announcement.title)) {
        db.prepare('INSERT INTO announcements (title,content,status,published_at,publisher_name) VALUES (?,?,?,?,?)').run(announcement.title,announcement.content,announcement.status,announcement.status==='published'?new Date().toISOString().slice(0,19).replace('T',' '):null,admin?.name || '系统管理员');
      }
    }
    db.prepare('INSERT INTO app_meta (key,value) VALUES (?,?)').run('extended_demo_data_v1',new Date().toISOString());
  });
  seedExtendedDemoData();
}
if (!db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('tracking_backfill_v1')) {
  const rows = db.prepare('SELECT operation_time, operation_type, object_type, object_name, change_summary FROM operation_logs').all();
  const insertTrack = db.prepare('INSERT INTO tracking_events (event_name,event_type,event_time,payload) VALUES (?,?,?,?)');
  const backfill = db.transaction(() => {
    for (const row of rows) insertTrack.run('operation', 'business', row.operation_time, JSON.stringify({ operation_type: row.operation_type, object_type: row.object_type, object_name: row.object_name, summary: row.change_summary }));
  });
  backfill();
  db.prepare('INSERT INTO app_meta (key,value) VALUES (?,?)').run('tracking_backfill_v1', new Date().toISOString());
}

const app = new Koa();
const router = new Router({ prefix: '/api' });
const auth = async (ctx, next) => { try { const token = ctx.headers.authorization?.replace('Bearer ', ''); ctx.state.user = jwt.verify(token, SECRET); } catch { ctx.status = 401; ctx.body = { message: '登录已过期，请重新登录' }; return; } await next(); };
const optionalAuth = async (ctx, next) => { try { const token = ctx.headers.authorization?.replace('Bearer ', ''); ctx.state.user = token ? jwt.verify(token, SECRET) : null; } catch { ctx.state.user = null; } await next(); };
router.post('/auth/login', ctx => { const { username, password } = ctx.request.body; const user = db.prepare('SELECT id,username,name FROM users WHERE username=? AND password=?').get(username, password); if (!user) { ctx.status = 401; ctx.body = { message: '账号或密码错误' }; return; } ctx.body = { token: jwt.sign(user, SECRET, { expiresIn: '8h' }), user }; });
router.get('/auth/me', auth, ctx => { ctx.body = ctx.state.user; });
router.post('/tracking/events', optionalAuth, ctx => {
  const events = Array.isArray(ctx.request.body) ? ctx.request.body : [ctx.request.body];
  const insert = db.prepare('INSERT INTO tracking_events (event_name,event_type,user_id,session_id,page_path,payload) VALUES (?,?,?,?,?,?)');
  let received = 0;
  for (const e of events) {
    if (!e || !e.event_name) continue;
    insert.run(String(e.event_name), String(e.event_type || 'click'), Number.isInteger(e.user_id) ? e.user_id : (ctx.state.user?.id ?? null), e.session_id ? String(e.session_id) : null, e.page_path ? String(e.page_path) : null, JSON.stringify(e.payload && typeof e.payload === 'object' ? e.payload : {}));
    received += 1;
  }
  ctx.body = { ok: true, received };
});
router.get('/dashboard', auth, ctx => {
  const total = db.prepare('SELECT COUNT(*) count FROM courses').get().count;
  const published = db.prepare("SELECT COUNT(*) count FROM courses WHERE status='已发布'").get().count;
  const students = db.prepare('SELECT COUNT(*) count FROM students').get().count;
  const activeStudents = db.prepare("SELECT COUNT(*) count FROM students WHERE status='正常'").get().count;
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const ymd = d.toISOString().slice(0, 10); days.push({ ymd, label: ymd.slice(5) }); }
  const counts = new Map(db.prepare('SELECT substr(event_time,1,10) d, COUNT(*) c FROM tracking_events WHERE substr(event_time,1,10) >= ? GROUP BY d').all(days[0].ymd).map(row => [row.d, row.c]));
  ctx.body = {
    stats: { courses: total, students, publishRate: total ? Math.round(published / total * 100) : 0, activeRate: students ? Math.round(activeStudents / students * 100) : 0 },
    enrollments: db.prepare('SELECT name,students FROM courses ORDER BY students DESC').all(),
    activity: days.map(d => ({ day: d.label, value: counts.get(d.ymd) || 0 })),
    studentStatus: db.prepare('SELECT status name,COUNT(*) value FROM students GROUP BY status').all(),
    categories: db.prepare('SELECT category name,COUNT(*) value FROM courses GROUP BY category').all(),
  };
});
const listQuery = (table, fields, filters) => { const { page=1, pageSize=10, status, category, sort } = filters; const search=filters.search ?? filters.keyword ?? ''; const where=[]; const values=[]; if (search) { where.push(`(${fields.map(f => `${f} LIKE ?`).join(' OR ')})`); fields.forEach(() => values.push(`%${search}%`)); } if (status) { where.push('status=?'); values.push(status); } if (category) { where.push('category=?'); values.push(category); } const className=filters.className ?? filters.class_name; if (table === 'students' && className) { where.push('class_name=?'); values.push(className); } const clause=where.length ? `WHERE ${where.join(' AND ')}` : ''; const order=sort === 'students' || filters.sortField === 'student_count' ? 'ORDER BY students DESC' : 'ORDER BY id DESC'; const total=db.prepare(`SELECT COUNT(*) count FROM ${table} ${clause}`).get(...values).count; const rows=db.prepare(`SELECT * FROM ${table} ${clause} ${order} LIMIT ? OFFSET ?`).all(...values, Number(pageSize), (Number(page)-1)*Number(pageSize)); return { rows, total, page:Number(page), pageSize:Number(pageSize) }; };
const courseStatus = value => ({ published: '已发布', draft: '草稿', archived: '已下架', offline: '已下架', cancelled: '已取消' }[value] || value);
const studentStatus = value => ({ active: '正常', inactive: '休学' }[value] || value);
router.get('/courses', auth, ctx => { ctx.body=listQuery('courses',['name','lecturer'],{ ...ctx.query, status: courseStatus(ctx.query.status) }); });
router.post('/courses', auth, ctx => { const { name, instructor_id, lecturer, category, description='' }=ctx.request.body; const status=courseStatus(ctx.request.body.status); if (status === '已取消') { ctx.status=400; ctx.body={msg:'课程不能以已取消状态创建'}; return; } const teacher=db.prepare('SELECT name FROM teachers WHERE id=?').get(instructor_id); const result=db.prepare('INSERT INTO courses (name,lecturer,instructor_id,category,status,description) VALUES (?,?,?,?,?,?)').run(name,teacher?.name || lecturer || '',instructor_id || null,category,status,description); ctx.body=db.prepare('SELECT * FROM courses WHERE id=?').get(result.lastInsertRowid); });
router.put('/courses/:id', auth, ctx => {
  const { name, instructor_id, lecturer, category, description='' }=ctx.request.body;
  const current=db.prepare('SELECT * FROM courses WHERE id=?').get(ctx.params.id);
  if (!current) { ctx.status=404; ctx.body={msg:'课程不存在'}; return; }
  const status=courseStatus(ctx.request.body.status);
  const cancelReason=String(ctx.request.body.cancel_reason || '').trim();
  if (current.status === '已取消' && status !== '已取消') { ctx.status=409; ctx.body={msg:'已取消课程不能恢复为其他状态'}; return; }
  if (status === '已取消' && current.status !== '已取消' && !cancelReason) { ctx.status=400; ctx.body={msg:'请填写课程取消原因'}; return; }
  const teacher=db.prepare('SELECT name FROM teachers WHERE id=?').get(instructor_id);
  const update=db.transaction(() => {
    db.prepare('UPDATE courses SET name=?,lecturer=?,instructor_id=?,category=?,status=?,description=?,cancel_reason=? WHERE id=?').run(name,teacher?.name || lecturer || '',instructor_id || null,category,status,description,status === '已取消' ? (cancelReason || current.cancel_reason || '') : current.cancel_reason,ctx.params.id);
    let cancelledEnrollmentCount=0;
    if (status === '已取消' && current.status !== '已取消') {
      cancelledEnrollmentCount=db.prepare("UPDATE enrollments SET status='cancelled',cancel_reason=? WHERE course_id=? AND status='studying'").run(cancelReason,ctx.params.id).changes;
      db.prepare("UPDATE courses SET students=(SELECT COUNT(*) FROM enrollments WHERE course_id=? AND status NOT IN ('dropped','cancelled')) WHERE id=?").run(ctx.params.id,ctx.params.id);
    }
    return cancelledEnrollmentCount;
  });
  const cancelledEnrollmentCount=update();
  ctx.body={...db.prepare('SELECT * FROM courses WHERE id=?').get(ctx.params.id),cancelledEnrollmentCount};
});
router.delete('/courses/:id', auth, ctx => { const hasEnrollments=db.prepare('SELECT 1 FROM enrollments WHERE course_id=? LIMIT 1').get(ctx.params.id); if (hasEnrollments) { ctx.status=409; ctx.body={msg:'课程存在选课记录，不能删除；请保留记录或先处理关联数据'}; return; } db.prepare('DELETE FROM courses WHERE id=?').run(ctx.params.id); ctx.body={ ok:true }; });
router.get('/students', auth, ctx => { const result=listQuery('students',['name','student_no'],{ ...ctx.query, status: studentStatus(ctx.query.status) }); result.rows=result.rows.map(row => ({ ...row, courseIds: db.prepare('SELECT course_id FROM student_courses WHERE student_id=?').all(row.id).map(item=>item.course_id) })); ctx.body=result; });
router.post('/students', auth, ctx => { const { name, student_no, class_name, status, email='', phone='' }=ctx.request.body; const courseIds=ctx.request.body.courseIds ?? ctx.request.body.course_ids ?? []; const insert=db.transaction(() => { const result=db.prepare('INSERT INTO students (name,student_no,class_name,status,email,phone) VALUES (?,?,?,?,?,?)').run(name,student_no,class_name,studentStatus(status),email,phone); const add=db.prepare('INSERT INTO student_courses VALUES (?,?)'); courseIds.forEach(id=>add.run(result.lastInsertRowid,id)); return result.lastInsertRowid; }); const id=insert(); ctx.body=db.prepare('SELECT * FROM students WHERE id=?').get(id); });
router.put('/students/:id', auth, ctx => { const { name, student_no, class_name, status, email='', phone='' }=ctx.request.body; const courseIds=ctx.request.body.courseIds ?? ctx.request.body.course_ids ?? []; const update=db.transaction(() => { db.prepare('UPDATE students SET name=?,student_no=?,class_name=?,status=?,email=?,phone=? WHERE id=?').run(name,student_no,class_name,studentStatus(status),email,phone,ctx.params.id); db.prepare('DELETE FROM student_courses WHERE student_id=?').run(ctx.params.id); const add=db.prepare('INSERT INTO student_courses VALUES (?,?)'); courseIds.forEach(id=>add.run(ctx.params.id,id)); }); update(); ctx.body=db.prepare('SELECT * FROM students WHERE id=?').get(ctx.params.id); });
router.delete('/students/:id', auth, ctx => { db.prepare('DELETE FROM students WHERE id=?').run(ctx.params.id); ctx.body={ok:true}; });
router.get('/courses/options', auth, ctx => { ctx.body=db.prepare("SELECT id,name FROM courses WHERE status='已发布' ORDER BY name").all(); });
router.get('/students/classes', auth, ctx => { ctx.body=db.prepare("SELECT DISTINCT class_name AS name FROM students WHERE class_name<>'' ORDER BY class_name").all().map(row => row.name); });
router.get('/teachers/options', auth, ctx => { ctx.body=db.prepare("SELECT id,name FROM teachers WHERE status='active' ORDER BY name").all(); });
router.get('/teachers', auth, ctx => { const result=listQuery('teachers',['name','phone','department'],ctx.query); ctx.body={ ...result, list:result.rows }; });
router.post('/teachers', auth, ctx => { const { name, phone='', department='', status='active', bio='' }=ctx.request.body; const result=db.prepare('INSERT INTO teachers (name,phone,department,status,bio) VALUES (?,?,?,?,?)').run(name,phone,department,status,bio); ctx.body=db.prepare('SELECT * FROM teachers WHERE id=?').get(result.lastInsertRowid); });
router.put('/teachers/:id', auth, ctx => { const { name, phone='', department='', status='active', bio='' }=ctx.request.body; db.prepare('UPDATE teachers SET name=?,phone=?,department=?,status=?,bio=? WHERE id=?').run(name,phone,department,status,bio,ctx.params.id); db.prepare('UPDATE courses SET lecturer=? WHERE instructor_id=?').run(name,ctx.params.id); ctx.body=db.prepare('SELECT * FROM teachers WHERE id=?').get(ctx.params.id); });
router.delete('/teachers/:id', auth, ctx => { const teacher=db.prepare('SELECT name FROM teachers WHERE id=?').get(ctx.params.id); db.prepare('UPDATE courses SET instructor_id=NULL WHERE instructor_id=?').run(ctx.params.id); db.prepare('DELETE FROM teachers WHERE id=?').run(ctx.params.id); ctx.body={ok:true, name:teacher?.name}; });
router.get('/enrollments', auth, ctx => { const { page=1, pageSize=10, courseId, studentId, status }=ctx.query; const where=[]; const values=[]; if (courseId) { where.push('e.course_id=?'); values.push(Number(courseId)); } if (studentId) { where.push('e.student_id=?'); values.push(Number(studentId)); } if (status) { where.push('e.status=?'); values.push(status); } const clause=where.length ? `WHERE ${where.join(' AND ')}` : ''; const total=db.prepare(`SELECT COUNT(*) count FROM enrollments e ${clause}`).get(...values).count; const list=db.prepare(`SELECT e.enrollment_id,e.student_id,e.course_id,e.status,e.note,e.cancel_reason,e.enrolled_at,s.name AS student_name,s.student_no,c.name AS course_name FROM enrollments e JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id ${clause} ORDER BY e.enrollment_id DESC LIMIT ? OFFSET ?`).all(...values,Number(pageSize),(Number(page)-1)*Number(pageSize)); ctx.body={list,total,page:Number(page),pageSize:Number(pageSize)}; });
router.post('/enrollments', auth, ctx => { const { student_id, course_id, note='' }=ctx.request.body; const studentId=Number(student_id); const courseId=Number(course_id); if (!Number.isInteger(studentId) || !Number.isInteger(courseId)) { ctx.status=400; ctx.body={msg:'学生或课程无效'}; return; } const course=db.prepare('SELECT status FROM courses WHERE id=?').get(courseId); if (!course) { ctx.status=404; ctx.body={msg:'课程不存在'}; return; } if (course.status !== '已发布') { ctx.status=409; ctx.body={msg:'仅可选择已发布课程'}; return; } if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(studentId)) { ctx.status=404; ctx.body={msg:'学生不存在'}; return; } const existing=db.prepare("SELECT enrollment_id FROM enrollments WHERE student_id=@student_id AND course_id=@course_id AND status NOT IN ('dropped','cancelled')").get({ student_id:studentId, course_id:courseId }); if (existing) { ctx.status=409; ctx.body={msg:'该学生已选修此课程'}; return; } const result=db.prepare("INSERT INTO enrollments (student_id,course_id,status,note) VALUES (?,?,'studying',?)").run(studentId,courseId,note); db.prepare("UPDATE courses SET students=(SELECT COUNT(*) FROM enrollments WHERE course_id=? AND status NOT IN ('dropped','cancelled')) WHERE id=?").run(courseId,courseId); ctx.body=db.prepare('SELECT * FROM enrollments WHERE enrollment_id=?').get(result.lastInsertRowid); });
router.patch('/enrollments/bulk/status', auth, ctx => { const ids=(ctx.request.body.ids || []).map(Number).filter(Number.isInteger); const status=ctx.request.body.status; if (!ids.length || !['studying','completed','dropped'].includes(status)) { ctx.status=400; ctx.body={msg:'选课记录或状态无效'}; return; } const placeholders=ids.map(()=>'?').join(','); if (db.prepare(`SELECT 1 FROM enrollments WHERE enrollment_id IN (${placeholders}) AND status='cancelled' LIMIT 1`).get(...ids)) { ctx.status=409; ctx.body={msg:'课程取消记录不能再变更为其他选课状态'}; return; } const affected=db.prepare(`SELECT DISTINCT course_id FROM enrollments WHERE enrollment_id IN (${placeholders})`).all(...ids); db.prepare(`UPDATE enrollments SET status=? WHERE enrollment_id IN (${placeholders})`).run(status,...ids); const updateCount=db.prepare("UPDATE courses SET students=(SELECT COUNT(*) FROM enrollments WHERE course_id=? AND status NOT IN ('dropped','cancelled')) WHERE id=?"); affected.forEach(row=>updateCount.run(row.course_id,row.course_id)); ctx.body={ok:true}; });
router.get('/operation-logs', auth, ctx => { const { page=1, pageSize=10, startDate, endDate, operationType }=ctx.query; const where=[]; const values=[]; if (startDate) { where.push("substr(operation_time,1,10)>=?"); values.push(startDate); } if (endDate) { where.push("substr(operation_time,1,10)<=?"); values.push(endDate); } if (operationType) { where.push('operation_type=?'); values.push(operationType); } const clause=where.length ? `WHERE ${where.join(' AND ')}` : ''; const total=db.prepare(`SELECT COUNT(*) count FROM operation_logs ${clause}`).get(...values).count; const list=db.prepare(`SELECT * FROM operation_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...values,Number(pageSize),(Number(page)-1)*Number(pageSize)); ctx.body={list,total,page:Number(page),pageSize:Number(pageSize)}; });
router.get('/announcements', auth, ctx => { const { page=1, pageSize=8, keyword='', status }=ctx.query; const where=[]; const values=[]; if (keyword) { where.push('title LIKE ?'); values.push(`%${keyword}%`); } if (status) { where.push('status=?'); values.push(status); } const clause=where.length ? `WHERE ${where.join(' AND ')}` : ''; const total=db.prepare(`SELECT COUNT(*) count FROM announcements ${clause}`).get(...values).count; const list=db.prepare(`SELECT * FROM announcements ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...values,Number(pageSize),(Number(page)-1)*Number(pageSize)); ctx.body={list,total,page:Number(page),pageSize:Number(pageSize)}; });
router.post('/announcements', auth, ctx => { const { title, content='' }=ctx.request.body; const result=db.prepare("INSERT INTO announcements (title,content,status,publisher_name) VALUES (?,?,'draft',?)").run(title,content,ctx.state.user.name); ctx.body=db.prepare('SELECT * FROM announcements WHERE id=?').get(result.lastInsertRowid); });
router.put('/announcements/:id', auth, ctx => { const { title, content='' }=ctx.request.body; db.prepare("UPDATE announcements SET title=?,content=? WHERE id=? AND status='draft'").run(title,content,ctx.params.id); ctx.body=db.prepare('SELECT * FROM announcements WHERE id=?').get(ctx.params.id); });
router.patch('/announcements/:id/publish', auth, ctx => { db.prepare("UPDATE announcements SET status='published',published_at=CURRENT_TIMESTAMP,publisher_name=? WHERE id=?").run(ctx.state.user.name,ctx.params.id); ctx.body=db.prepare('SELECT * FROM announcements WHERE id=?').get(ctx.params.id); });
router.patch('/announcements/:id/offline', auth, ctx => { db.prepare("UPDATE announcements SET status='offline' WHERE id=?").run(ctx.params.id); ctx.body=db.prepare('SELECT * FROM announcements WHERE id=?').get(ctx.params.id); });
app.use(async (ctx, next) => {
  await next();
  if (!ctx.state.user || !['POST','PUT','PATCH','DELETE'].includes(ctx.method) || ctx.status >= 400) return;
  const [, resource, id] = ctx.path.match(/^\/api\/([^/]+)(?:\/(\d+))?/) || [];
  const names = { courses:'课程', students:'学生', teachers:'教师', enrollments:'选课', announcements:'公告' };
  if (!names[resource]) return;
  const body = ctx.body && typeof ctx.body === 'object' ? ctx.body : {};
  const operation = resource === 'courses' && ctx.method === 'PUT' && body.status === '已取消'
    ? '状态变更'
    : { POST:'新增', PUT:'编辑', PATCH:'状态变更', DELETE:'删除' }[ctx.method];
  const objectName = body.name || body.title || body.student_name || body.course_name || (id ? `记录 #${id}` : `记录 #${body.enrollment_id || ''}`);
  const summary=resource === 'courses' && body.status === '已取消'
    ? `取消原因：${body.cancel_reason || '未填写'}；影响在读选课 ${body.cancelledEnrollmentCount || 0} 条`
    : `${operation}${names[resource]}`;
  db.prepare('INSERT INTO operation_logs (operator_name,operation_type,object_type,object_name,change_summary) VALUES (?,?,?,?,?)').run(ctx.state.user.name,operation,names[resource],objectName,summary);
});
app.use(cors()).use(bodyParser()).use(router.routes()).use(router.allowedMethods());
const dist = path.resolve(root, '../client/dist'); app.use(serve(dist));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running at http://localhost:' + PORT));