import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Form,
  Input,
  Button,
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Space,
  Modal,
  Select,
  message,
  Popconfirm,
  DatePicker,
  Tooltip as AntTooltip,
} from "antd";
import {
  DashboardOutlined,
  AuditOutlined,
  TeamOutlined,
  BookOutlined,
  LogoutOutlined,
  UserOutlined,
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  RiseOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import axios from "axios";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "antd/dist/reset.css";
import "highlight.js/styles/github-dark.css";
import "./styles.css";

const api = axios.create({ baseURL: "/api" });
const courseStatusToUi: Record<string, string> = {
  published: "已发布",
  draft: "草稿",
  archived: "已下架",
};
const courseStatusToApi: Record<string, string> = {
  已发布: "published",
  草稿: "draft",
  已下架: "draft",
};
const studentStatusToUi: Record<string, string> = {
  active: "正常",
  inactive: "休学",
};
const studentStatusToApi: Record<string, string> = {
  正常: "active",
  休学: "inactive",
};
const mapCourse = (course: any) =>
  course
    ? {
        ...course,
        lecturer: course.instructor ?? course.lecturer ?? "",
        students: course.student_count ?? course.students ?? 0,
        status: courseStatusToUi[course.status] || course.status,
      }
    : course;
const mapStudent = (student: any) =>
  student
    ? {
        ...student,
        status: studentStatusToUi[student.status] || student.status,
        courseIds: student.course_ids ?? student.courseIds ?? [],
      }
    : student;
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  const url = config.url || "";
  if (token && url !== "/auth/login")
    config.headers.Authorization = `Bearer ${token}`;
  const params: any = config.params || {};
  if (url === "/courses/options") {
    (config as any).courseOptions = true;
    config.url = "/courses";
    config.params = { status: "published", page: 1, pageSize: 100 };
  }
  if (url === "/students/classes") (config as any).classOptions = true;
  if (url === "/teachers/options") (config as any).teacherOptions = true;
  if (url === "/enrollments") {
    const enrollmentParams: any = { ...params };
    if (enrollmentParams.courseId)
      enrollmentParams.courseId = Number(enrollmentParams.courseId);
    if (enrollmentParams.studentId)
      enrollmentParams.studentId = Number(enrollmentParams.studentId);
    config.params = enrollmentParams;
  }
  if (url === "/courses" && config.method === "get") {
    config.params = {
      ...params,
      keyword: params.search ?? params.keyword,
      sortField: params.sort ? "student_count" : undefined,
      sortOrder: params.sort ? "descend" : undefined,
      status: courseStatusToApi[params.status] || params.status || undefined,
    };
    delete config.params.search;
    delete config.params.sort;
  }
  if (url === "/students" && config.method === "get") {
    config.params = {
      ...params,
      keyword: params.search ?? params.keyword,
      className: params.class_name ?? params.className,
      status: studentStatusToApi[params.status] || params.status || undefined,
    };
    delete config.params.search;
    delete config.params.class_name;
  }
  if (
    config.data &&
    typeof config.data === "object" &&
    !Array.isArray(config.data)
  ) {
    const data: any = { ...config.data };
    if (url.startsWith("/courses")) {
      data.status = courseStatusToApi[data.status] || data.status;
      delete data.lecturer;
      delete data.students;
    }
    if (url.startsWith("/students")) {
      data.course_ids = data.courseIds ?? data.course_ids;
      data.status = studentStatusToApi[data.status] || data.status;
      delete data.courseIds;
    }
    config.data = data;
  }
  return config;
});
api.interceptors.response.use(
  (response) => {
    const raw: any = response.data;
    const data =
      raw && typeof raw === "object" && "code" in raw && "data" in raw
        ? raw.data
        : raw;
    const url = response.config.url || "";
    const isCourseOptions = (response.config as any).courseOptions;
    const isClassOptions = (response.config as any).classOptions;
    const isTeacherOptions = (response.config as any).teacherOptions;
    if (url === "/auth/login") response.data = data;
    else if (url === "/dashboard") {
      const stats = data?.stats || {};
      const charts = data?.charts || {};
      const totalCourses = stats.totalCourses ?? stats.courses ?? 0;
      const totalStudents = stats.totalStudents ?? stats.students ?? 0;
      response.data = {
        stats: {
          courses: totalCourses,
          students: totalStudents,
          publishRate:
            stats.publishRate ??
            (totalCourses
              ? Math.round((stats.publishedCourses / totalCourses) * 100)
              : 0),
          activeRate:
            stats.activeRate ??
            (totalStudents
              ? Math.round((stats.activeStudents / totalStudents) * 100)
              : 0),
        },
        enrollments: (charts.enrollment ?? data?.enrollments ?? []).map((item: any) => ({
          ...item,
          students: item.value ?? item.students ?? 0,
        })),
        activity: (charts.activity ?? data?.activity ?? []).map((item: any) => ({
          ...item,
          day: item.label ?? item.day,
          value: item.students ?? item.value ?? 0,
        })),
        studentStatus: charts.statusDist ?? data?.studentStatus ?? [],
        categories: charts.categoryDist ?? data?.categories ?? [],
      };
    } else if (isCourseOptions)
      response.data = (Array.isArray(data) ? data : data?.list ?? data?.rows ?? []).map(mapCourse);
    else if (isClassOptions) response.data = data || [];
    else if (isTeacherOptions) response.data = data || [];
    else if (url === "/teachers" && response.config.method === "get")
      response.data = {
        rows: data?.list ?? data?.rows ?? [],
        total: data?.total || 0,
        page: data?.page || 1,
        pageSize: data?.pageSize || 10,
      };
    else if (url === "/announcements" && response.config.method === "get")
      response.data = {
        rows: data?.list ?? data?.rows ?? [],
        total: data?.total || 0,
        page: data?.page || 1,
        pageSize: data?.pageSize || 10,
      };
    else if (url === "/courses" && response.config.method === "get")
      response.data = {
        rows: (data?.list ?? data?.rows ?? []).map(mapCourse),
        total: data?.total || 0,
        page: data?.page || 1,
        pageSize: data?.pageSize || 10,
      };
    else if (url.startsWith("/courses/")) response.data = mapCourse(data);
    else if (url === "/students" && response.config.method === "get")
      response.data = {
        rows: (data?.list ?? data?.rows ?? []).map(mapStudent),
        total: data?.total || 0,
        page: data?.page || 1,
        pageSize: data?.pageSize || 10,
      };
    else if (url === "/operation-logs")
      response.data = {
        rows: data?.list || [],
        total: data?.total || 0,
        page: data?.page || 1,
        pageSize: data?.pageSize || 10,
      };
    else if (url === "/enrollments" && response.config.method === "get")
      response.data = {
        rows: data?.list || [],
        total: data?.total || 0,
        page: data?.page || 1,
        pageSize: data?.pageSize || 10,
      };
    else if (url.startsWith("/enrollments/")) response.data = data;
    else if (url.startsWith("/students/")) response.data = mapStudent(data);
    else if (url === "/summary") response.data = data;
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && error.config?.url !== "/auth/login") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
type Course = {
  id: number;
  name: string;
  lecturer: string;
  category: string;
  status: string;
  students: number;
  description?: string;
  lesson_count?: number;
};
type Student = {
  id: number;
  name: string;
  student_no: string;
  class_name: string;
  status: string;
  email: string;
  phone: string;
  courseIds?: number[];
};
const statusColor: Record<string, string> = {
  已发布: "green",
  草稿: "gold",
  已下架: "default",
  正常: "green",
  休学: "orange",
};
const categories = [
  "前端开发",
  "后端开发",
  "数据库",
  "数据科学",
  "工具",
  "运维",
  "通识素养",
];

function Login() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const submit = async (v: { username: string; password: string }) => {
    setLoading(true);
    try {
      const r = await api.post("/auth/login", v);
      localStorage.setItem("token", r.data.token);
      localStorage.setItem("user", JSON.stringify(r.data.user));
      nav("/");
    } catch (error: any) {
      message.error(error.response?.data?.msg || "账号或密码错误");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="login-page">
      <div className="login-art">
        <div className="brand-mark">知</div>
        <h1>知行学习管理</h1>
        <p>让每一次学习，都有迹可循</p>
        <div className="login-orbit">A</div>
      </div>
      <Card className="login-card" bordered={false}>
        <div className="mobile-brand">知行 · 学习管理</div>
        <h2>欢迎回来</h2>
        <p className="muted">登录管理你的课程与学生</p>
        <Form
          layout="vertical"
          onFinish={submit}
        >
          <Form.Item
            label="账号"
            name="username"
            rules={[{ required: true, message: "请输入账号" }]}
          >
            <Input
              size="large"
              prefix={<UserOutlined />}
              placeholder="请输入账号"
            />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: "请输入密码" }]}
          >
            <Input.Password size="large" placeholder="请输入密码" />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            size="large"
            block
            loading={loading}
          >
            进入工作台
          </Button>
        </Form>
      </Card>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const user = JSON.parse(
    localStorage.getItem("user") || '{"name":"系统管理员"}',
  );
  const logout = () => {
    localStorage.clear();
    nav("/login");
  };
  const items = [
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: <NavLink to="/">工作台</NavLink>,
    },
    {
      key: "/courses",
      icon: <BookOutlined />,
      label: <NavLink to="/courses">课程管理</NavLink>,
    },
    {
      key: "/students",
      icon: <TeamOutlined />,
      label: <NavLink to="/students">学生管理</NavLink>,
    },
        {
          key: "/teachers",
          icon: <TeamOutlined />,
          label: <NavLink to="/teachers">教师管理</NavLink>,
        },
    {
      key: "/enrollments",
      icon: <BookOutlined />,
      label: <NavLink to="/enrollments">选课管理</NavLink>,
    },
    {
      key: "/operation-logs",
      icon: <AuditOutlined />,
      label: <NavLink to="/operation-logs">操作日志</NavLink>,
    },
    {
      key: "/announcements",
      icon: <AuditOutlined />,
      label: <NavLink to="/announcements">公告管理</NavLink>,
    },
  ];
  return (
    <Layout className="app-layout">
      <Layout.Sider breakpoint="lg" collapsedWidth="0" className="sider">
        <div className="logo">
          <span>知</span>
          <b>知行</b>
          <small>学习管理平台</small>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
        />
        <div className="sider-footer">2026 · KNOWLEDGE LAB</div>
      </Layout.Sider>
      <Layout>
        <Layout.Header className="topbar">
          <div>
            <span className="eyebrow">LEARNING OPERATIONS</span>
            <h3>
              {items.find((i) => i.key === location.pathname)?.label ||
                "工作台"}
            </h3>
          </div>
          <Dropdown
            menu={{
              items: [
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "退出登录",
                  onClick: logout,
                },
              ],
            }}
          >
            <Space className="user-menu">
              <Avatar size={36} icon={<UserOutlined />} />
              <span>{user.name}</span>
            </Space>
          </Dropdown>
        </Layout.Header>
        <Layout.Content className="content">{children}</Layout.Content>
      </Layout>
    </Layout>
  );
}
function Protected({ children }: { children: React.ReactNode }) {
  return localStorage.getItem("token") ? (
    <Shell>{children}</Shell>
  ) : (
    <Navigate to="/login" replace />
  );
}

function Dashboard() {
  const [data, setData] = useState<any>();
  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data));
  }, []);
  if (!data) return <div className="loading">正在加载工作台...</div>;
  const stat = data.stats;
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow accent">OVERVIEW / 01</span>
          <h1>今天，也在持续进步。</h1>
          <p>这是你的学习管理概览，掌握课程和学生的每一个变化。</p>
        </div>
        <div className="date-chip">
          <RiseOutlined /> 本周数据概览
        </div>
      </div>
      <Row gutter={[18, 18]} className="stats-row">
        {[
          ["课程总数", stat.courses, "门", "violet", "统计未软删除的全部课程。"],
          ["学生总数", stat.students, "人", "teal", "统计未软删除的全部学生。"],
          ["课程发布率", stat.publishRate, "%", "orange", "已发布课程数 ÷ 全部课程数（不含已软删除课程）。"],
          ["学生状态正常率", stat.activeRate, "%", "blue", "状态为正常的学生数 ÷ 全部未软删除学生数。"],
        ].map(([title, value, suffix, color, description]) => (
          <Col xs={24} sm={12} lg={6} key={title as string}>
            <Card className={`stat-card ${color}`}>
              <Statistic
                title={title as string}
                value={value as number}
                suffix={suffix as string}
                formatter={(formattedValue) => (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span>{formattedValue}</span>
                    <AntTooltip title={description}>
                      <span
                        tabIndex={0}
                        aria-label={`${title}统计口径`}
                        style={{ display: "inline-flex", color: "#888", fontSize: 14, cursor: "help" }}
                      >
                        <QuestionCircleOutlined />
                      </span>
                    </AntTooltip>
                  </span>
                )}
              />
              <div className="stat-foot">
                较上周 <b>+12.5%</b>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[18, 18]}>
        <Col xs={24} lg={14}>
          <Card
            title="选课人数趋势"
            extra={<span className="card-label">按课程</span>}
          >
            <div className="chart">
              <ResponsiveContainer>
                <BarChart
                  data={data.enrollments}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) =>
                      v.length > 7 ? v.slice(0, 7) + "…" : v
                    }
                  />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="students"
                    name="选课人数"
                    fill="#6257e8"
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title="近 7 天活跃度"
            extra={<span className="card-label green-label">LIVE</span>}
          >
            <div className="chart">
              <ResponsiveContainer>
                <LineChart data={data.activity}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" />
                  <YAxis hide />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name="活跃度"
                    stroke="#19a88d"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#19a88d" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>
      <Row gutter={[18, 18]} className="bottom-charts">
        <Col xs={24} lg={12}>
          <Card title="学生状态">
            <div className="chart small">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data.studentStatus}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={82}
                    paddingAngle={4}
                  >
                    {data.studentStatus.map((_: any, i: number) => (
                      <Cell
                        key={i}
                        fill={["#6257e8", "#19a88d", "#f4a340"][i % 3]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="课程分类">
            <div className="chart small">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data.categories}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={82}
                    paddingAngle={4}
                  >
                    {data.categories.map((_: any, i: number) => (
                      <Cell
                        key={i}
                        fill={
                          ["#f4a340", "#f06b68", "#6257e8", "#19a88d"][i % 4]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function CoursePage() {
  const [data, setData] = useState<{ rows: Course[]; total: number }>({
    rows: [],
    total: 0,
  });
  const [teachers, setTeachers] = useState<any[]>([]);
  const [q, setQ] = useState({
    page: 1,
    pageSize: 8,
    search: "",
    status: "",
    category: "",
    sort: "",
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Course>();
  const [form] = Form.useForm();
  const load = () =>
    api.get("/courses", { params: q }).then((r) => setData(r.data));
  useEffect(() => {
    load();
    api.get("/teachers/options").then((r) => setTeachers(r.data));
  }, [q]);
  const edit = (item?: Course) => {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue(
      item
        ? { ...item, instructor_id: (item as any).instructor_id }
        : { status: "草稿", category: categories[0] },
    );
    setOpen(true);
  };
  const save = async (v: any) => {
    try {
      await (editing
        ? api.put(`/courses/${editing.id}`, v)
        : api.post("/courses", v));
      message.success("保存成功");
      setOpen(false);
      load();
    } catch (error: any) {
      message.error(error.response?.data?.msg || "保存课程失败");
    }
  };
  return (
    <div className="page">
      <div className="page-title compact">
        <div>
          <span className="eyebrow accent">CATALOG / 02</span>
          <h1>课程管理</h1>
          <p>维护课程内容、讲师和发布状态。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>
          新增课程
        </Button>
      </div>
      <Card className="table-card">
        <div className="filters">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索课程名或讲师"
            onChange={(e) => setQ({ ...q, page: 1, search: e.target.value })}
          />
          <Select
            allowClear
            placeholder="课程状态"
            onChange={(v) => setQ({ ...q, page: 1, status: v || "" })}
            options={["草稿", "已发布", "已下架"].map((v) => ({
              label: v,
              value: v,
            }))}
          />
          <Select
            allowClear
            placeholder="课程分类"
            onChange={(v) => setQ({ ...q, page: 1, category: v || "" })}
            options={categories.map((v) => ({ label: v, value: v }))}
          />
          <Select
            placeholder="排序"
            onChange={(v) => setQ({ ...q, sort: v })}
            options={[
              { label: "默认排序", value: "" },
              { label: "选课人数最多", value: "students" },
            ]}
          />
        </div>
        <Table
          rowKey="id"
          dataSource={data.rows}
          pagination={{
            current: q.page,
            pageSize: q.pageSize,
            total: data.total,
            showSizeChanger: false,
            onChange: (page) => setQ({ ...q, page }),
          }}
          columns={[
            {
              title: "课程名称",
              dataIndex: "name",
              render: (v: string, r: Course) => (
                <div className="course-name">
                  <span className="course-icon">{v[0]}</span>
                  <div>
                    <b>{v}</b>
                    <small>{r.description || "暂无课程简介"}</small>
                  </div>
                </div>
              ),
            },
            { title: "讲师", dataIndex: "lecturer" },
            {
              title: "分类",
              dataIndex: "category",
              render: (v: string) => <Tag>{v}</Tag>,
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (v: string) => <Tag color={statusColor[v]}>{v}</Tag>,
            },
            { title: "选课人数", dataIndex: "students", sorter: true },
            {
              title: "操作",
              key: "action",
              render: (_: any, r: Course) => (
                <Space>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => edit(r)}
                  />
                  <Popconfirm
                    title="确认删除这门课程？"
                    onConfirm={() => api.delete(`/courses/${r.id}`).then(load)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing ? "编辑课程" : "新增课程"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="name" label="课程名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="instructor_id"
            label="讲师"
            rules={[{ required: true, message: "请选择讲师" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={teachers.map((teacher) => ({
                label: teacher.name,
                value: teacher.id,
              }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="category"
                label="分类"
                rules={[{ required: true }]}
              >
                <Select
                  options={categories.map((v) => ({ label: v, value: v }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true }]}
              >
                <Select
                  options={["草稿", "已发布", "已下架"].map((v) => ({
                    label: v,
                    value: v,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="课程简介">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function StudentPage() {
  const [data, setData] = useState<{ rows: Student[]; total: number }>({
    rows: [],
    total: 0,
  });
  const [courses, setCourses] = useState<any[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [q, setQ] = useState({
    page: 1,
    pageSize: 8,
    search: "",
    status: "",
    class_name: "",
  });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Student>();
  const [form] = Form.useForm();
  const load = () =>
    api.get("/students", { params: q }).then((r) => setData(r.data));
  useEffect(() => {
    load();
    api.get("/courses/options").then((r) => setCourses(r.data));
    api.get("/students/classes").then((r) => setClasses(r.data));
  }, [q]);
  const edit = (item?: Student) => {
    setEditing(item);
    form.resetFields();
    form.setFieldsValue(item || { status: "正常", courseIds: [] });
    setOpen(true);
  };
  const save = async (v: any) => {
    setSaving(true);
    try {
      await (editing
        ? api.put(`/students/${editing.id}`, v)
        : api.post("/students", v));
      message.success("保存成功");
      setOpen(false);
      form.resetFields();
      load();
    } catch (error: any) {
      message.error(
        error.response?.data?.msg || "保存失败，请检查网络或填写内容",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page">
      <div className="page-title compact">
        <div>
          <span className="eyebrow accent">PEOPLE / 03</span>
          <h1>学生管理</h1>
          <p>管理学生档案和课程学习关系。</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>
          新增学生
        </Button>
      </div>
      <Card className="table-card">
        <div className="filters">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索姓名或学号"
            onChange={(e) => setQ({ ...q, page: 1, search: e.target.value })}
          />
          <Select
            allowClear
            placeholder="班级"
            onChange={(v) => setQ({ ...q, page: 1, class_name: v || "" })}
            options={classes.map((v) => ({ label: v, value: v }))}
          />
          <Select
            allowClear
            placeholder="状态"
            onChange={(v) => setQ({ ...q, page: 1, status: v || "" })}
            options={["正常", "休学"].map((v) => ({ label: v, value: v }))}
          />
        </div>
        <Table
          rowKey="id"
          dataSource={data.rows}
          pagination={{
            current: q.page,
            pageSize: q.pageSize,
            total: data.total,
            showSizeChanger: false,
            onChange: (page) => setQ({ ...q, page }),
          }}
          columns={[
            {
              title: "学生",
              dataIndex: "name",
              render: (v: string, r: Student) => (
                <div className="student-name">
                  <Avatar>{v[0]}</Avatar>
                  <div>
                    <b>{v}</b>
                    <small>{r.student_no}</small>
                  </div>
                </div>
              ),
            },
            { title: "班级", dataIndex: "class_name" },
            {
              title: "联系方式",
              dataIndex: "email",
              render: (v: string, r: Student) => (
                <div>
                  {v}
                  <small>{r.phone}</small>
                </div>
              ),
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (v: string) => <Tag color={statusColor[v]}>{v}</Tag>,
            },
            {
              title: "操作",
              key: "action",
              render: (_: any, r: Student) => (
                <Space>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => edit(r)}
                  />
                  <Popconfirm
                    title="确认删除这位学生？"
                    onConfirm={() => api.delete(`/students/${r.id}`).then(load)}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={editing ? "编辑学生" : "新增学生"}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okButtonProps={{ loading: saving }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="student_no"
                label="学号"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="class_name"
                label="班级"
                rules={[{ required: true }]}
              >
                <Select
                  options={classes.map((v) => ({ label: v, value: v }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select
                  options={["正常", "休学"].map((v) => ({
                    label: v,
                    value: v,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="email" label="邮箱">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="courseIds" label="已选课程">
            <Select
              mode="multiple"
              options={courses.map((v) => ({ label: v.name, value: v.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

const notes = `# 前端学习总结

## 1. 组件化思维

React 的核心是把页面拆分为可复用的组件。组件应该拥有清晰的职责，通过 props 接收输入，通过事件向外传递变化。

## 2. 异步数据流

在实际项目中，页面通常需要处理加载、成功和失败三种状态。使用 Axios 拦截器统一注入 JWT，可以让业务组件保持简洁。

\`\`\`ts
const response = await api.get('/dashboard');
setDashboard(response.data);
\`\`\`

## 3. 我的收获

这次练习串起了路由、鉴权、表单、数据可视化和 SQLite。下一步会继续完善权限模型，并为关键流程补充自动化测试。
`;
function Notes() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/summary")
      .then((r) => setContent(r.data.content))
      .catch(() => message.error("学习总结加载失败"))
      .finally(() => setLoading(false));
  }, []);
  const markdownComponents = {
    img: ({ src, alt, ...props }: { src?: string; alt?: string }) => (
      <img
        {...props}
        alt={alt || ""}
        src={src?.startsWith("assets/") ? `/api/static/${src}` : src}
      />
    ),
  };
  return (
    <div className="page notes-page">
      <div className="page-title">
        <div>
          <span className="eyebrow accent">JOURNAL / 04</span>
          <h1>学习总结</h1>
          <p>把实践留下来，知识才真正属于自己。</p>
        </div>
      </div>
      <Card className="markdown-card">
        {loading ? (
          <div className="loading">正在加载学习总结...</div>
        ) : (
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {content}
          </ReactMarkdown>
        )}
      </Card>
    </div>
  );
}

function TeacherPage() {
  const [data, setData] = useState<{ rows: any[]; total: number }>({ rows: [], total: 0 });
  const [q, setQ] = useState({ page: 1, pageSize: 8, search: '', status: '' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const load = () => api.get('/teachers', { params: q }).then(r => setData({ rows: r.data.list || r.data.rows || [], total: r.data.total || 0 }));
  useEffect(() => { load(); }, [q]);
  const edit = (teacher?: any) => { setEditing(teacher); form.resetFields(); form.setFieldsValue(teacher || { status: 'active' }); setOpen(true); };
  const save = async (values: any) => { setSaving(true); try { await (editing ? api.put(`/teachers/${editing.id}`, values) : api.post('/teachers', values)); message.success('保存成功'); setOpen(false); load(); } catch (error: any) { message.error(error.response?.data?.msg || '保存教师失败'); } finally { setSaving(false); } };
  const remove = async (id: number) => { try { await api.delete(`/teachers/${id}`); message.success('删除成功'); load(); } catch (error: any) { message.error(error.response?.data?.msg || '删除失败'); } };
  return <div className="page"><div className="page-title compact"><div><h1>教师管理</h1></div><Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新增教师</Button></div><Card className="table-card"><div className="filters"><Input allowClear prefix={<SearchOutlined />} placeholder="搜索姓名、手机号或部门" onChange={e => setQ({ ...q, page: 1, search: e.target.value })} /><Select allowClear placeholder="教师状态" onChange={v => setQ({ ...q, page: 1, status: v || '' })} options={[{ label: '在岗', value: 'active' }, { label: '离职', value: 'inactive' }]} /></div><Table rowKey="id" dataSource={data.rows} pagination={{ current: q.page, pageSize: q.pageSize, total: data.total, showSizeChanger: false, onChange: page => setQ({ ...q, page }) }} columns={[{ title: '教师ID', dataIndex: 'id', width: 90 }, { title: '姓名', dataIndex: 'name' }, { title: '手机号', dataIndex: 'phone' }, { title: '所属部门', dataIndex: 'department' }, { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '在岗' : '离职'}</Tag> }, { title: '简介', dataIndex: 'bio' }, { title: '操作', render: (_: any, record: any) => <Space><Button type="text" icon={<EditOutlined />} onClick={() => edit(record)} /><Popconfirm title="确认删除该教师？" onConfirm={() => remove(record.id)}><Button type="text" danger icon={<DeleteOutlined />} /></Popconfirm></Space> }]} /></Card><Modal title={editing ? '编辑教师' : '新增教师'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okButtonProps={{ loading: saving }} okText="保存" cancelText="取消"><Form form={form} layout="vertical" onFinish={save}><Row gutter={12}><Col span={12}><Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input /></Form.Item></Col><Col span={12}><Form.Item name="phone" label="手机号"><Input /></Form.Item></Col></Row><Row gutter={12}><Col span={12}><Form.Item name="department" label="所属部门"><Input /></Form.Item></Col><Col span={12}><Form.Item name="status" label="状态"><Select options={[{ label: '在岗', value: 'active' }, { label: '离职', value: 'inactive' }]} /></Form.Item></Col></Row><Form.Item name="bio" label="简介"><Input.TextArea rows={3} /></Form.Item></Form></Modal></div>;
}

function EnrollmentPage() {
  const [data, setData] = useState<{ rows: any[]; total: number }>({
    rows: [],
    total: 0,
  });
  const [courses, setCourses] = useState<any[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    courseId: "",
    studentId: "",
    status: "",
  });
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const load = () =>
    api
      .get("/enrollments", { params: filters })
      .then((r) => setData(r.data))
      .catch(() => message.error("选课记录加载失败"));
  useEffect(() => {
    load();
    api.get("/courses/options").then((r) => setCourses(r.data));
    api
      .get("/students", { params: { page: 1, pageSize: 100 } })
      .then((r) => setStudents(r.data.rows));
  }, [filters]);
  const add = async (v: any) => {
    setSaving(true);
    try {
      await api.post("/enrollments", {
        student_id: v.studentId,
        course_id: v.courseId,
        note: v.note || "",
      });
      message.success("新增选课成功");
      setOpen(false);
      form.resetFields();
      load();
    } catch (error: any) {
      message.error(error.response?.data?.msg || "新增选课失败");
    } finally {
      setSaving(false);
    }
  };
  const changeStatus = async (ids: React.Key[]) => {
    try {
      await api.patch("/enrollments/bulk/status", { ids, status: "dropped" });
      message.success(ids.length > 1 ? "批量退课成功" : "退课成功");
      setSelected([]);
      load();
    } catch (error: any) {
      message.error(error.response?.data?.msg || "退课失败");
    }
  };
  const statusNames: Record<string, string> = {
    studying: "在读",
    completed: "已结课",
    dropped: "退课",
  };
  return (
    <div className="page">
      <div className="page-title compact">
        <div>
          <h1>选课管理</h1>
        </div>
        <Space>
          <Button
            danger
            disabled={!selected.length}
            onClick={() => changeStatus(selected)}
          >
            批量退课
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setOpen(true);
            }}
          >
            新增选课
          </Button>
        </Space>
      </div>
      <Card className="table-card">
        <div className="filters">
          <Select
            allowClear
            placeholder="按课程筛选"
            onChange={(value) =>
              setFilters({ ...filters, page: 1, courseId: value || "" })
            }
            options={courses.map((item) => ({
              label: item.name,
              value: item.id,
            }))}
          />
          <Select
            allowClear
            placeholder="按学生筛选"
            onChange={(value) =>
              setFilters({ ...filters, page: 1, studentId: value || "" })
            }
            options={students.map((item) => ({
              label: `${item.name} (${item.student_no})`,
              value: item.id,
            }))}
          />
          <Select
            allowClear
            placeholder="选课状态"
            onChange={(value) =>
              setFilters({ ...filters, page: 1, status: value || "" })
            }
            options={Object.entries(statusNames).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
        <Table
          rowKey="enrollment_id"
          rowSelection={{
            selectedRowKeys: selected,
            onChange: setSelected,
            getCheckboxProps: (record) => ({
              disabled: record.status === "dropped",
            }),
          }}
          dataSource={data.rows}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: data.total,
            showSizeChanger: false,
            onChange: (page) => setFilters({ ...filters, page }),
          }}
          columns={[
            { title: "选课ID", dataIndex: "enrollment_id", width: 90 },
            { title: "学生姓名", dataIndex: "student_name" },
            { title: "学号", dataIndex: "student_no" },
            { title: "课程名称", dataIndex: "course_name" },
            { title: "选课时间", dataIndex: "enrolled_at" },
            {
              title: "选课状态",
              dataIndex: "status",
              render: (value: string) => (
                <Tag
                  color={
                    value === "studying"
                      ? "green"
                      : value === "completed"
                        ? "blue"
                        : "default"
                  }
                >
                  {statusNames[value] || value}
                </Tag>
              ),
            },
            { title: "备注", dataIndex: "note" },
            {
              title: "操作",
              render: (_: any, record: any) => (
                <Button
                  type="link"
                  danger
                  disabled={record.status === "dropped"}
                  onClick={() => changeStatus([record.enrollment_id])}
                >
                  退课
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title="新增选课"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okButtonProps={{ loading: saving }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={add}>
          <Form.Item
            name="studentId"
            label="学生"
            rules={[{ required: true, message: "请选择学生" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={students.map((item) => ({
                label: `${item.name} (${item.student_no})`,
                value: item.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="courseId"
            label="课程"
            rules={[{ required: true, message: "请选择课程" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={courses.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function OperationLogs() {
  const [data, setData] = useState<{ rows: any[]; total: number }>({
    rows: [],
    total: 0,
  });
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 10,
    startDate: "",
    endDate: "",
    operationType: "",
  });
  const load = () =>
    api
      .get("/operation-logs", { params: filters })
      .then((r) => setData(r.data))
      .catch(() => message.error("操作日志加载失败"));
  useEffect(() => {
    load();
  }, [filters]);
  const types = ["新增", "编辑", "删除", "状态变更"];
  return (
    <div className="page">
      <div className="page-title compact">
        <div>
          <h1>操作日志</h1>
        </div>
      </div>
      <Card className="table-card">
        <div className="filters">
          <DatePicker.RangePicker
            placeholder={["开始日期", "结束日期"]}
            onChange={(_, dateStrings) =>
              setFilters({
                ...filters,
                page: 1,
                startDate: dateStrings[0] || "",
                endDate: dateStrings[1] || "",
              })
            }
          />
          <Select
            allowClear
            placeholder="操作类型"
            onChange={(value) =>
              setFilters({ ...filters, page: 1, operationType: value || "" })
            }
            options={types.map((value) => ({ label: value, value }))}
          />
        </div>
        <Table
          rowKey="id"
          dataSource={data.rows}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: data.total,
            showSizeChanger: false,
            onChange: (page) => setFilters({ ...filters, page }),
          }}
          columns={[
            { title: "操作时间", dataIndex: "operation_time", width: 190 },
            { title: "操作人", dataIndex: "operator_name", width: 120 },
            {
              title: "操作类型",
              dataIndex: "operation_type",
              width: 120,
              render: (value: string) => (
                <Tag
                  color={
                    value === "删除"
                      ? "red"
                      : value === "新增"
                        ? "green"
                        : value === "状态变更"
                          ? "gold"
                          : "blue"
                  }
                >
                  {value}
                </Tag>
              ),
            },
            { title: "操作对象", dataIndex: "object_type", width: 120 },
            { title: "对象名称", dataIndex: "object_name", width: 220 },
            { title: "变更简述", dataIndex: "change_summary" },
          ]}
        />
      </Card>
    </div>
  );
}

function AnnouncementEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value; }, [value]);
  const command = (name: string, commandValue?: string) => { editorRef.current?.focus(); document.execCommand(name, false, commandValue); onChange(editorRef.current?.innerHTML || ''); };
  return <div className="rich-editor"><div className="rich-toolbar"><Button size="small" onClick={() => command('bold')}><b>B</b></Button><Button size="small" onClick={() => command('italic')}><i>I</i></Button><Button size="small" onClick={() => command('insertUnorderedList')}>列表</Button><Button size="small" onClick={() => command('formatBlock', 'h3')}>标题</Button></div><div ref={editorRef} className="rich-content" contentEditable suppressContentEditableWarning onInput={e => onChange(e.currentTarget.innerHTML)} /></div>;
}

function AnnouncementsPage() {
  const [data, setData] = useState<{ rows: any[]; total: number }>({ rows: [], total: 0 });
  const [q, setQ] = useState({ page: 1, pageSize: 8, keyword: '', status: '' });
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<any>(); const [saving, setSaving] = useState(false); const [form] = Form.useForm();
  const load = () => api.get('/announcements', { params: q }).then(r => setData(r.data)).catch(() => message.error('公告加载失败'));
  useEffect(() => { load(); }, [q]);
  const edit = (item?: any) => { setEditing(item); form.resetFields(); form.setFieldsValue(item || {}); setOpen(true); };
  const save = async (values: any) => { setSaving(true); try { await (editing ? api.put(`/announcements/${editing.id}`, values) : api.post('/announcements', values)); message.success('保存成功'); setOpen(false); load(); } catch (error: any) { message.error(error.response?.data?.msg || '保存公告失败'); } finally { setSaving(false); } };
  const changeStatus = async (item: any, action: 'publish' | 'offline') => { try { await api.patch(`/announcements/${item.id}/${action}`); message.success(action === 'publish' ? '发布成功' : '下线成功'); load(); } catch (error: any) { message.error(error.response?.data?.msg || '操作失败'); } };
  const statusNames: Record<string, string> = { draft: '草稿', published: '已发布', offline: '已下线' };
  return <div className="page"><div className="page-title compact"><div><h1>公告管理</h1></div><Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新增公告</Button></div><Card className="table-card"><div className="filters"><Input allowClear prefix={<SearchOutlined />} placeholder="搜索公告标题" onChange={e => setQ({ ...q, page: 1, keyword: e.target.value })} /><Select allowClear placeholder="公告状态" onChange={v => setQ({ ...q, page: 1, status: v || '' })} options={Object.entries(statusNames).map(([value, label]) => ({ value, label }))} /></div><Table rowKey="id" dataSource={data.rows} pagination={{ current: q.page, pageSize: q.pageSize, total: data.total, showSizeChanger: false, onChange: page => setQ({ ...q, page }) }} columns={[{ title: '标题', dataIndex: 'title', width: 260 }, { title: '发布时间', dataIndex: 'published_at', width: 180, render: (v: string) => v || '-' }, { title: '状态', dataIndex: 'status', width: 120, render: (v: string) => <Tag color={v === 'published' ? 'green' : v === 'draft' ? 'gold' : 'default'}>{statusNames[v] || v}</Tag> }, { title: '发布人', dataIndex: 'publisher_name', width: 120, render: (v: string) => v || '-' }, { title: '内容预览', dataIndex: 'content', ellipsis: true, render: (v: string) => <span dangerouslySetInnerHTML={{ __html: v }} /> }, { title: '操作', width: 230, render: (_: any, item: any) => <Space>{item.status === 'draft' && <><Button type="link" onClick={() => edit(item)}>编辑</Button><Popconfirm title="确认发布该公告？" onConfirm={() => changeStatus(item, 'publish')}><Button type="link">发布</Button></Popconfirm></>}{item.status === 'published' && <Popconfirm title="确认下线该公告？" onConfirm={() => changeStatus(item, 'offline')}><Button type="link" danger>下线</Button></Popconfirm>}</Space> }]} /></Card><Modal title={editing ? '编辑公告' : '新增公告'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} okButtonProps={{ loading: saving }} okText="保存" cancelText="取消"><Form form={form} layout="vertical" onFinish={save}><Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入公告标题' }]}><Input maxLength={100} /></Form.Item><Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入公告内容' }]}><Form.Item noStyle shouldUpdate>{({ getFieldValue, setFieldsValue }) => <AnnouncementEditor value={getFieldValue('content') || ''} onChange={value => setFieldsValue({ content: value })} />}</Form.Item></Form.Item></Form></Modal></div>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/courses"
        element={
          <Protected>
            <CoursePage />
          </Protected>
        }
      />
      <Route
        path="/students"
        element={
          <Protected>
            <StudentPage />
          </Protected>
        }
      />
      <Route
        path="/teachers"
        element={
          <Protected>
            <TeacherPage />
          </Protected>
        }
      />
      <Route
        path="/enrollments"
        element={
          <Protected>
            <EnrollmentPage />
          </Protected>
        }
      />
      <Route
        path="/operation-logs"
        element={
          <Protected>
            <OperationLogs />
          </Protected>
        }
      />
      <Route path="/announcements" element={<Protected><AnnouncementsPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
