# 🍲 cookafeast

> Người bạn đồng hành điềm tĩnh giúp người Việt — đặc biệt là **con trưởng đang gánh vác việc nhà** — lo cỗ, cơm cúng cho các dịp lễ Tết, giỗ, rằm... mà **không sợ làm sai, không sợ trễ giờ cúng, không phải gánh một mình.**

cookafeast dẫn bạn đi trọn một con đường: **chọn dịp → dựng thực đơn → chốt số mâm → đi chợ → nấu đúng giờ cúng → làm lễ → nhìn lại.** Bản thiết kế đầy đủ ở [docs/DESIGN.md](docs/DESIGN.md).

## Bốn trụ cột

| | Trụ cột | Cốt lõi |
|---|---|---|
| **a** | Thực đơn & quy đổi mâm | Preset theo dịp/vùng miền, mọi tính toán bám theo **số người** (mâm chỉ là hiển thị), đi chợ gộp theo quầy — có mục **Đồ thờ/Vàng mã** riêng |
| **b** | Lập lịch nấu theo deadline | Lập lịch ngược từ giờ cúng (T0), tách *thời gian giữ người* khỏi *thời gian hầm/ngâm* để nấu song song, tách món **làm trước** ra khỏi ngày D |
| **c** | Cộng tác local *(v1)* | Một máy làm host, người nhà quét QR vào cùng phiên qua wifi — không cần internet |
| **d** | Dẫn dắt + thủ tục cúng + ký ức | Cook Mode đếm ngược + nút "Tôi xong việc này", văn khấn điền sẵn, lưu mâm cho năm sau |

## Kiến trúc

Monorepo TypeScript (npm workspaces), local-first:

```
packages/
  core/    — engine thuần TS, dùng chung FE+BE: scaling, shopping, scheduler (CPM + Serial SGS), generator
  server/  — Fastify + better-sqlite3 (nguồn sự thật) + REST API + serve client + in QR
  client/  — Vite + React PWA (7 màn), gọi API; core dùng làm type
data/seed/ — dữ liệu seed (dịp, món, công thức + timing, nguyên liệu, khung mâm) — miền Bắc
```

## Chạy thử

Cần Node ≥ 20.

```bash
npm install          # cài deps cho cả 3 package
npm run start        # build core+client rồi chạy server, in URL + QR cho điện thoại
```

Mở `http://localhost:8088` trên máy, hoặc **quét QR** để mở trên điện thoại cùng wifi nhà.

### Lệnh khác

```bash
npm test                              # 24 test cho engine core
npm run dev -w @cookafeast/server     # server chế độ watch (cổng 8088)
npm run dev -w @cookafeast/client     # Vite dev server (cổng 5173, proxy /api → 8088)
npm run validate -w @cookafeast/server # kiểm tra toàn vẹn seed + chạy thử 1 mâm qua engine
```

## Trạng thái (MVP)

✅ Engine core (scaling/shopping/scheduler/generator) + 24 test · ✅ Seed 11 dịp / 31 món / 109 nguyên liệu / 21 khung mâm · ✅ Server REST + SQLite · ✅ Client PWA 7 màn · ✅ Chạy `npm run start` một lệnh.

Để dành cho **v1**: cộng tác đa thiết bị (WebSocket + nhận việc), vùng Trung/Nam, re-plan lịch realtime, lịch âm tự động, tầng AI (Claude) gợi ý món. Xem lộ trình đầy đủ trong [docs/DESIGN.md §8](docs/DESIGN.md).
