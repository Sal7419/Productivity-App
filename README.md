# Chance Productivity 

**Chance** là một ứng dụng quản lý năng suất toàn diện được xây dựng bằng React, Tailwind CSS và Node.js. Ứng dụng giúp bạn tối ưu hóa thời gian, quản lý công việc khoa học và theo dõi tiến độ phát triển bản thân thông qua các công cụ hiện đại.

---

##  Tính năng nổi bật

### 1. Đồng hồ Pomodoro
- Hỗ trợ 3 chế độ: **Tập trung (Focus)**, **Nghỉ ngắn (Short Break)** và **Nghỉ dài (Long Break)**.
- **Tùy chỉnh thời gian**: Cho phép chỉnh sửa trực tiếp Giờ, Phút, Giây cho từng chế độ bằng cách nhấn vào biểu tượng cài đặt (bánh răng).
- Giao diện tối giản, giúp bạn tập trung tối đa vào công việc.

### 2. Danh sách nhiệm vụ (Task List)
- Thiết kế theo phong cách **Bento Grid** hiện đại, trực quan.
- Phân loại nhiệm vụ theo danh mục: Học tập, Công việc, Đời sống, Sức khỏe.
- Hiển thị mức độ ưu tiên (High/Medium/Low) và thời hạn (Deadline).

### 3. Bảng Kanban & Lịch (Kanban & Calendar)
- **Kanban**: Quản lý trạng thái công việc qua các cột: *Cần làm (To Do)*, *Đang làm (In Progress)* và *Hoàn thành (Done)*.
- **Lịch**: Tự động cập nhật ngày tháng. Các ngày có Deadline sẽ được **tô đậm và đánh dấu đỏ** để dễ dàng nhận diện.

### 4. Theo dõi thói quen (Habit Tracker)
- Chia làm 2 cột chuyên biệt: **Thói quen Học tập** và **Thói quen Đời sống**.
- Theo dõi chuỗi ngày hoàn thành (Streaks) để tạo động lực duy trì thói quen.

### 5. Thống kê chi tiết (Analytics)
- **Tiến độ & Khối lượng**: Biểu đồ so sánh giữa kế hoạch và thực tế.
- **Nhiệm vụ quá hạn**: Cảnh báo các công việc bị trễ deadline.
- **Phân bổ danh mục**: Xem bạn đang dành bao nhiêu thời gian cho từng mảng trong cuộc sống.
- **Biểu đồ nhiệt (Heatmap)**: Thống kê năng suất làm việc theo từng khung giờ trong ngày.

---

## Công nghệ sử dụng

- **Frontend**: React 19, Vite, Tailwind CSS 4.
- **Animation**: Framer Motion.
- **Biểu đồ**: Recharts.
- **Icons**: Lucide React.
- **Backend**: Node.js, Express.

---

## Hướng dẫn cài đặt và chạy thử

### 1. Tải mã nguồn
```bash
git clone https://github.com/ten-cua-ban/chance-productivity.git
cd chance-productivity
```

### 2. Cài đặt thư viện
```bash
npm install
```

### 3. Chạy ứng dụng ở chế độ phát triển
```bash
npm run dev
```
Sau khi chạy lệnh, mở trình duyệt và truy cập: `http://localhost:3000`

---

## Hướng dẫn sử dụng

1. **Sử dụng Pomodoro**: Chọn chế độ bạn muốn, nhấn Play để bắt đầu. Để đổi thời gian, di chuột vào đồng hồ và nhấn vào biểu tượng bánh răng.
2. **Quản lý Task**: Tại trang Tasks, bạn có thể xem các công việc đang có. Chuyển sang trang Kanban để kéo thả hoặc cập nhật trạng thái.
3. **Theo dõi thói quen**: Mỗi ngày sau khi thực hiện thói quen, hãy nhấn vào chữ cái tương ứng (M, T, W...) để đánh dấu hoàn thành.
4. **Xem thống kê**: Truy cập trang Statistics để đánh giá hiệu quả làm việc của bạn qua các biểu đồ trực quan.

---

## Lưu ý
Dự án này hiện đang chạy với dữ liệu mẫu (Mock Data). Bạn có thể phát triển thêm phần kết nối Database (MongoDB/PostgreSQL) ở file `server.ts` để lưu trữ dữ liệu thực tế.

---

*Chúc bạn có những giây phút làm việc thật năng suất cùng Chance!* 
