# cookafeast — Bản Thiết Kế Sản Phẩm Hoàn Chỉnh

> Tài liệu tổng hợp từ toàn bộ nghiên cứu văn hóa, khảo sát prior art và bốn thiết kế kỹ thuật con. Đã giải quyết các mâu thuẫn giữa thiết kế con (chọn dứt khoát một phương án sync và một tech stack).

---

## 1. Tầm nhìn & người dùng mục tiêu

### 1.1. Tuyên ngôn sản phẩm
cookafeast là **người bạn đồng hành điềm tĩnh** giúp người Việt — đặc biệt là **con trưởng đang gánh vác việc nhà** — nấu cỗ/cơm cúng cho các dịp lễ Tết, giỗ, rằm, đầy tháng... mà **không sợ làm sai, không sợ trễ giờ cúng, không phải gánh một mình**.

Khác biệt cốt lõi **không phải là thuật toán** (lập lịch ngược từ giờ ăn đã là table-stakes ở phương Tây), mà là **tầng cảm xúc + bản địa hóa sâu**: app dẫn dắt thay vì để người dùng tự xoay, số hóa nghi lễ cúng để họ không bao giờ sợ "làm sai lễ", và biến việc nấu cỗ thành **nơi gìn giữ nếp nhà**.

### 1.2. Định vị độc nhất (từ khảo sát prior art)
Khảo sát cho thấy từng mảnh ghép đều đã có người làm tốt, nhưng **chưa ai ghép cả ba** vào một sản phẩm:

| Năng lực | Tiền lệ đã có | Khoảng trống |
|---|---|---|
| Lập lịch ngược từ giờ ăn | Time To Plate, MealMaster, MultiCook | Chỉ món Âu, một người |
| Mô hình hóa thiết bị bếp hạn chế | MealMaster | Không cộng tác, không cỗ Việt |
| Phân việc theo kỹ năng/sở thích | Cookmark (nghiên cứu, không thương mại) | Không có trục thời gian/deadline |
| Shopping list dùng chung real-time | AnyList, Plan to Eat | Không lập lịch nấu, scaling tuyến tính |
| Kho công thức cỗ Việt | Cooky, Cookpad VN, Esheep | Chỉ tra cứu, không điều phối |

**Giao điểm "cỗ Việt + cộng tác local + lập lịch deadline = giờ cúng" hiện chưa app nào phục vụ.** Đó là định vị của cookafeast.

### 1.3. Chân dung người dùng chính — "Anh/Chị Cả"
Con trưởng, vừa mất cha/mẹ (rất có thể đang trong tang). Lần đầu tiên thay cha/mẹ đứng ra lo cỗ. Dịp đầu tiên họ mở app rất có thể là **cúng 49/100 ngày** hoặc **giỗ đầu**. Nấu trên điện thoại, ngay trong bếp (tay ướt, dầu mỡ).

**Bốn nỗi sợ phải gỡ:**
1. Sợ làm sai lễ nghi → app biết và chỉ rõ thủ tục cúng.
2. Sợ không kịp giờ → lập lịch ngược, luôn nói rõ "đang đúng tiến độ".
3. Sợ không "chuẩn" → preset theo dịp/vùng miền + món bắt buộc.
4. Sợ một mình gánh → giao việc cho người phụ bếp + tầng ký ức.

### 1.4. Bốn mục tiêu cảm xúc (đặt tên để đo được)
**ĐƯỢC DẪN DẮT · YÊN TÂM · NHẸ GÁNH · TỰ HÀO GIỮ NẾP NHÀ.**

---

## 2. Bốn trụ cột tính năng

### Trụ cột (a) — Thực đơn & quy đổi mâm/người + đi chợ

**Preset theo dịp.** Thư viện 19+ dịp được mã hóa với thuộc tính: `loaiMam` (chay/mặn/cả hai/chúng sinh), `thoiDiem`, `quyMo` (gia đình/đông khách/tiệc lớn), `vungMien` (Bắc/Trung/Nam), `lichAm`, `ritualChecklist`. Phân ba nhóm scale: **đông khách** (Tết, giỗ đầu/hết, mừng thọ, tân gia, cưới — nhập số mâm/khách), **gia đình** (cúng Táo, rằm/mùng 1, đầy tháng, 49/100 ngày — mặc định 1 mâm), **có mâm phụ** (giao thừa, Vu Lan chúng sinh, tất niên Nam).

**Generator rule-based ghép mâm cân đối.** Neo dịp/miền/loại mâm vào khung "vai trò món" (DishRole): ĐẦU VỊ · XÀO · CANH/BÁT · TINH BỘT · NỘM/DƯA · TRÁNG MIỆNG. Đặt **món neo bắt buộc** trước (miền Bắc: gà luộc + xôi; Tết Nam: thịt kho hột vịt + bánh tét), rồi lấp slot còn lại bằng `scoreDish` = điểm phù hợp vai trò − phạt trùng nguyên liệu − phạt trùng cách chế biến − phạt lặp món dịp gần đây − phạt vượt kỹ năng + thưởng make-ahead khớp quỹ thời gian − phạt vượt ngân sách. Triết lý **Greedy + Repair** (không tối ưu toàn cục) để giữ tốc độ tương tác <50ms và **giải thích được** ("vì sao món này").

**Quy đổi mâm ↔ người.** Nguyên tắc vàng: mọi tính toán bám theo `persons` (1 phần = 1 người ăn), **mâm chỉ là lớp hiển thị** (`persons = trays × perTray`, mặc định 6, cấu hình 4/6/8/10). Tránh scale theo số mâm vì gây làm tròn kép. Ba chế độ xử lý số lẻ (vd 14 người): **ROUND_UP** (18 phần, mặc định cho cỗ trang trọng), **EXACT** (14 phần, tiệc thân mật), **HYBRID** (2 mâm + 2 lẻ).

**Đi chợ.** Ba bước: (1) explode mỗi món ra dòng nguyên liệu đã scale; (2) GỘP theo `ingredientId + baseUnit`; (3) quy về đơn vị mua + làm tròn `purchaseStep` **một lần ở cuối**. Nhóm theo quầy chợ thực tế: THỊT/CÁ → RAU CỦ → ĐỒ KHÔ-GIA VỊ → **ĐỒ THỜ/VÀNG MÃ** (mục riêng nổi bật — thứ người lần đầu hay quên).

### Trụ cột (b) — Engine lập lịch nấu theo deadline & nấu song song

Nấu cỗ kịp giờ chính là bài toán **RCPSP/job-shop bếp**: món = job, bước nấu = task, mặt bếp/lò/nồi hấp/người = tài nguyên, **giờ cúng = deadline cứng (T0)**. Nút thắt thật không phải thời gian mà là **TÀI NGUYÊN** (lò + mặt bếp + người).

Chìa khóa nấu song song: tách **active time** (chiếm người) khỏi **passive time** (hầm/ướp/để nguội — chỉ chiếm thiết bị). Trong lúc nồi hầm passive, người đó đi làm task active khác. Khác biệt so với app hiện có: deadline = giờ cúng (cúng Táo trước giờ Ngọ ⇒ **không dời được**), món bắt buộc theo vùng (không cắt gà luộc/xôi), điều phối nhiều người trong cùng một bếp.

### Trụ cột (c) — Cộng tác nhiều người nấu + đồng bộ local đa thiết bị

Mô hình **host-authoritative local-first**: một máy (laptop/mini-PC của con trưởng) làm HOST chạy Node + WebSocket; những người khác vào bằng điện thoại qua wifi nhà (quét QR, zero-install). Host là **nguồn sự thật duy nhất**, làm "trọng tài" giải xung đột "2 người cùng nhận 1 việc" bằng giao dịch tuần tự (CAS). Khớp tự nhiên với văn hóa "con trưởng đứng bếp điều phối".

Giao việc theo kỹ năng/sở thích (ý tưởng Cookmark): ai sợ dao, ai ngại sơ chế thịt sống → không bị giao việc đó. Bảng "ai đang làm gì" để không ai bị bỏ rơi hoặc ôm hết.

### Trụ cột (d) — Dẫn dắt nấu + thủ tục cúng + ký ức gia đình

**Cook Mode** (trái tim cảm xúc): đếm ngược T0, "việc của TÔI ngay bây giờ" nổi bật + nút khổng lồ "Tôi xong việc này", nhắc nhẹ đúng mốc (T-90/T-60/T-30), cảnh báo trễ 2 cấp (vàng = "không sao, làm sau vẫn kịp"; cam-bình tĩnh = đường găng + đề xuất cắt món slack cao). Không bao giờ đỏ-gắt-trách-móc.

**Thủ tục cúng số hóa** (gỡ nỗi sợ lớn nhất): checklist bày mâm (gà quay đầu về bát hương) → thắp hương (số nén lẻ theo dịp) → **văn khấn điền sẵn** tên/ngày/địa chỉ/lý do → chờ hương ~2/3 → hóa vàng (thần linh trước, gia tiên sau) → hạ lễ thụ lộc.

**Ký ức gia đình** (xuyên suốt): sổ công thức nhà mình ("mẹ hay nấu thế này"), nhật ký các dịp đã lo, góc tưởng nhớ (ảnh + món cha thích + lời nhắn), nếp nhà (quy ước riêng). Tầng ký ức len lỏi tự nhiên — nổi lên đúng món khi nấu, không thành "bảo tàng" tách rời.

---

## 3. Mô hình dữ liệu cốt lõi (tổng hợp thống nhất)

Ba nguyên tắc nền: (1) đơn vị nội bộ = **PHẦN/người**; (2) tách **TEMPLATE** (tái dùng) khỏi **INSTANCE** (lần cụ thể); (3) tách **RecipeStep** ra để nuôi scheduler.

### 3.1. Sơ đồ quan hệ (rút gọn)
```
Occasion (preset dịp) ──1:n──▶ MenuTemplate (khung mâm theo dịp×miền×cấp độ)
MenuTemplate ──n:m──▶ Dish ──1:1──▶ Recipe
Recipe ──1:n──▶ RecipeIngredient ──n:1──▶ Ingredient
Recipe ──1:n──▶ RecipeStep (DAG qua predecessorIds — nuôi scheduler)

MenuInstance (mâm thực của 1 dịp)
   ├─ occasionId, region, scaleMode, eventBufferType, serveAt (T0)
   ├─ ScalingProfile (perTray, trays/guestCount, persons, fullTrays, remainder)
   └─1:n─ MenuInstanceDish (snapshot Recipe + overrides + required + trayGroup)

MenuInstance ──1:1──▶ ShoppingList ──1:n──▶ ShoppingItem (đã gộp+quy đổi)
MenuInstance ──1:1──▶ CookSession
CookSession ──1:n──▶ ScheduledTask (output scheduler: start/end/slack/resource)
CookSession ──1:n──▶ KitchenResource (bếp/lò/nồi/người)
CookSession ──n:m──▶ Person ; ScheduledTask ──1:1──▶ TaskAssignment (real-time)
CookSession ──1:1──▶ RitualPlan (checklist cúng + văn khấn)
FamilyMemory (xuyên suốt: recipes, diary, remembrance, houseConventions)
```

### 3.2. Các thực thể chính
- **Occasion**: `group` (TET/GIO/RAM/DOI_NGUOI/LE_HOI), `lunarHint`, `mamTypes`, `scaleClass`, `timeOfDay`, `hasOutdoorTray`, `ritualChecklist`, `defaultBufferType`, `regionNotes`.
- **Dish**: `roles[]` (DishRole), `region[]`, `mamType[]`, `difficulty 1-3`, `mainIngredients[]`, `cookMethods[]`, `makeAheadMinutes`, `isNearServe`, `equipment[]`, `tags[]`, `recipeId`, `source: SEED|USER`.
- **RecipeStep** (đơn vị lập lịch): `activeMin` / `passiveMin` (tách rời — chìa khóa nấu song song), `machine` (BEP/LO/HAP/NOI_NINH/CHAO_CHIEN), `ovenTempC`, `predecessorIds[]`, `needsPeople`, `mustFinishHot`, `makeAheadDays`, `produces/consumes` (nước luộc gà → miến).
- **Ingredient**: `divisibility` (CONTINUOUS/DISCRETE/SEASONING), `baseUnit`, `purchaseUnit`, `purchaseStep`, `unitConvert`, `yield`, `marketSection`, `unitPrice?`.
- **MenuInstanceDish**: `recipeSnapshot` (copy công thức tại thời điểm chọn — sửa thư viện sau không làm sai lệch mâm đã chốt), `required`, `trayGroup` (TRONG_NHA/NGOAI_TROI/CHUNG_SINH/CHAY).
- **ScheduledTask**: `start/end`, `activeEnd`, `latestStart`, `slackMin`, `onCriticalPath`, `status`, `assignedResourceIds`.
- **TaskAssignment**: `personId?`, `status` (TODO/IN_PROGRESS/DONE/BLOCKED), `progress`, `version` (optimistic-lock cho CAS), `updatedAt` (server-stamped).
- **Person/Cook**: `skill 1-3`, `avoid[]` (KNIFE/RAW_MEAT/FRY).

### 3.3. Thứ tự áp hệ số (tránh sai số kép — quan trọng)
`persons → ceil đơn vị DISCRETE TRƯỚC → CONTINUOUS nhân buffer rồi ÷yield rồi làm tròn purchaseStep → SEASONING dùng ratio^0.85`. Gộp chợ ở mức `baseUnit` **sau** khi scale từng dòng, quy đổi đơn vị mua **một lần** ở cuối.

---

## 4. Kiến trúc kỹ thuật & tech stack (đã chốt, giải quyết mâu thuẫn)

### 4.1. Quyết định lớn nhất: hợp nhất hai thiết kế con về sync
Hai thiết kế con đề xuất gần giống nhau nhưng có khác biệt. **Tech-stack design** mô tả real-time đơn giản (WS fan-out + last-write-wins theo `updatedAt`, "không cần CRDT"). **Sync design** đề xuất chi tiết hơn (event log + seq + claim CAS + outbox + CRDT-lite).

**Phán quyết: chọn mô hình host-authoritative của Sync design làm chuẩn, nhưng triển khai theo lộ trình của Tech-stack design.**
- **Xương sống: Node host + WebSocket** (loại Yjs/CRDT vì "nhận việc" là ràng buộc loại trừ không merge được; loại Supabase/PocketBase vì nặng vận hành cho quy mô 1 bếp).
- **Claim-task: CAS tuần tự ở host theo `version` + `seq`** (đây là điểm bắt buộc — last-write-wins KHÔNG đủ cho claim độc quyền).
- **Tiến độ/ghi chú: LWW per-field theo serverSeq** (đủ, không cần vector clock).
- **Offline: outbox trong IndexedDB + idempotency theo `clientMutationId`** (reconnect replay an toàn).
- **Đồng hồ chuẩn = host clock** (chống lệch đồng hồ làm sai đếm ngược T0).

### 4.2. Tech stack chốt

| Lớp | Chọn | Lý do |
|---|---|---|
| **Monorepo** | npm workspaces, 3 package | `core` (TS thuần) dùng chung FE+BE → engine cho cùng kết quả dù tính ở đâu |
| **packages/core** | TypeScript thuần, test vitest | Scaling + scheduler + shopping-list + domain types. KHÔNG phụ thuộc DB/React |
| **Frontend** | Vite + React + TS, PWA (vite-plugin-pwa/Workbox) | Loại Next.js (SSR/RSC vô dụng khi chạy 1 máy LAN). SvelteKit là phương án thay thế hợp lệ nếu team thạo Svelte |
| **Backend** | Fastify + @fastify/websocket | Nhẹ, WS bền, schema-validation (TypeBox). Tách BE/FE để bọc Tauri sau dễ |
| **DB host** | SQLite qua better-sqlite3, WAL mode | Đúng quy mô 1 nhà. Nguồn sự thật. Không cần Postgres/Docker |
| **DB client** | IndexedDB qua Dexie | Chỉ cache offline + outbox. KHÔNG phải nguồn ghi chính |
| **State client** | TanStack Query (server cache) + Zustand (UI) + WS event bus | Query lo fetch/invalidate; WS đẩy patch; Zustand state cục bộ |
| **Discovery** | mDNS (bonjour-service) + QR code | `cookafeast.local` + in QR IP:port. Lưu ý: trình duyệt không truy cập mDNS trực tiếp → QR + room code là chủ đạo |
| **Đóng gói** | `npm run start` một lệnh; v1.5 tùy chọn Tauri | Build client → Fastify serve static + API + WS + migration + seed + in QR |
| **Lịch âm** | lunar-javascript (v1) | v0 cho nhập ngày dương + gợi ý |
| **AI** | Claude API sau adapter SuggestionProvider, off-by-default (v2) | Không phải dependency lõi; app chạy hoàn toàn offline |

### 4.3. Cấu trúc repo
```
cookafeast/
├─ packages/
│  ├─ core/    ← scaling, shopping-list, scheduler (CPM+SSGS), generator, domain types
│  ├─ server/  ← Fastify, better-sqlite3, migrations, seed, REST + WS hub, repository
│  └─ client/  ← Vite+React PWA, UI, Dexie (cache+outbox)
├─ data/seed/  ← occasions/dishes/recipes/ingredients/menu-templates (JSON, versioned)
└─ package.json (scripts: dev / build / start)
```

### 4.4. Vì sao kiến trúc này phù hợp
1. Đúng quy mô: 1 nhà, vài chục người, 1 bếp → 1 server + 1 SQLite + WS LAN là tối giản mà đủ. Không over-engineer.
2. Một engine, hai nơi dùng (FE preview offline + BE chốt cho cùng kết quả).
3. Local-first thực dụng (host-first): SQLite là chân lý; IndexedDB chỉ cache + outbox.
4. AI là tùy chọn cộng thêm, không phải xương sống.

---

## 5. Engine lập lịch — tóm tắt thuật toán

Kiến trúc 3 pha:

**PHA A — Build graph.** Quy mọi ràng buộc bản địa về cận thời gian: "xong trước T0 X phút" → `LF_cap = T0 - X`; `canHold/holdMax` → chèn hold-task passive làm bộ đệm; `makeAheadWindow > 0` → tách ra "lịch hôm trước" riêng (giải phóng tài nguyên ngày D); `produces/consumes` → thêm cạnh precedence ngầm + tái dùng nồi/bếp; cộng buffer vào task dài + đặt `effectiveT0 = T0 - internalDeadlineSlack` (15-20').

**PHA B — Backward CPM** (bỏ qua tài nguyên, tính độ gấp):
```
LF[t] = min(effectiveT0 - mustFinishBeforeT0,  min(LS[s] for s in successors))
LS[t] = LF[t] - (durActive + durPassive)
ES[t] = max(max EF[predecessors], makeAheadFloor)
slack[t] = LS[t] - ES[t]          # slack==0 ⇒ ĐƯỜNG GĂNG
earliestStartOverall = min(LS[t]) # "phải vào bếp lúc mấy giờ"
```

**PHA C — Serial SGS** (xếp lịch tôn trọng tài nguyên + phân công song song):
- Tập eligible (mọi predecessor đã xong), sort theo **(slack ASC, dur DESC, #successors DESC)** = Minimum-Slack → Longest-Processing-Time → Most-Successors.
- `findEarliestFeasible`: tìm thời điểm sớm nhất có đủ người (đủ skill, không vi phạm avoid) + thiết bị (lò gom cùng nhiệt độ; mặt bếp/nồi rảnh).
- **Người nhả tại `activeEnd` (không phải `end`)** ⇒ task passive chạy trên thiết bị trong khi người đi làm task active khác ⇒ song song thật.
- Cảnh báo trễ: `start > LS[t]` → vàng; nếu trên critical path → đỏ + escalate.

**Không kịp** (`makespan > effectiveT0`) → gợi ý: **CUT_DISH** (món slack cao, `required=false`), **BUY_INSTEAD** (giò/chả mua sẵn → biến task nấu thành thái bày), **SHIFT_T0** (nếu T0 mềm — cúng Táo trước giờ Ngọ là cứng nên KHÔNG dời được), **ADD_COOK**.

**Realtime re-plan:** sự kiện `taskDone` → pin task DONE/RUNNING (cố định, không xếp lại) → chạy lại CPM+SSGS chỉ cho phần pending. SSGS constructive chạy <vài ms cho mâm 6-12 món. Debounce 30-60s tránh "lịch nhảy".

**Chế độ 1 người = trường hợp đặc biệt** (pool người=1): SSGS suy biến thành nối tiếp tối ưu nhưng vẫn khai thác passive (bật nồi ninh trước rồi sơ chế trong lúc chờ).

---

## 6. Mô hình cộng tác & đồng bộ local — tóm tắt

**Topology:** Router/hotspot LAN nhà bếp; máy HOST (con trưởng) chạy Node process (HTTP static + WS + mDNS + SQLite + event log); các điện thoại là PWA member (IndexedDB cache + outbox).

**Tham gia phiên:** QR code (chính, nhanh nhất — payload chứa URL + roomCode + joinToken ngắn hạn) → room code thủ công (6 ký tự) → mDNS hostname `cookafeast.local` (tiện ích phụ).

**Session = 1 phòng bếp = 1 sự kiện nấu**, vòng đời LOBBY → COOKING → DONE/ARCHIVED. Vai trò: **HOST** (con trưởng: tạo phiên, phân công, force-release, trọng tài), **MEMBER** (tự nhận việc, cập nhật tiến độ), **CO_HOST** (ủy quyền, chuẩn bị host-handoff).

**Đường ghi:** client tạo mutation (`clientMutationId` + `baseSeq`) → vào outbox → optimistic UI → gửi WS. Host validate → áp state → cấp `seq` tăng dần → ghi event log → broadcast event đã-đánh-số. Client áp theo `seq`; reconnect chỉ xin event `> lastSeq` (hoặc snapshot nếu tụt quá xa).

**Giải xung đột theo loại dữ liệu (CRDT-lite):**
- **Claim-task: CAS độc quyền** — `if assignment.memberId==null && version==expectedVersion → set owner, version++, nextSeq, broadcast TASK_CLAIMED; else CLAIM_REJECTED gửi riêng người thua`. Hai claim "đồng thời" → host xử lý tuần tự → A thắng, B revert + gợi ý task khác.
- **Tiến độ/ghi chú: LWW per-field** theo serverSeq.
- **Đếm: counter-delta** (cộng dồn, không set tuyệt đối).

**Mất mạng:** tích lũy outbox + badge "đang chờ đồng bộ"; reconnect gửi `HELLO {lastSeq, pendingMutations[]}` → host replay + xử lý idempotent.

**Host-handoff** (dự phòng): host mất heartbeat >60s → CO_HOST tiếp quản (HOST_CHANGED). Khuyến nghị: chọn 1 máy cố định làm host, handoff chỉ là phương án dự phòng.

---

## 7. Trải nghiệm & các màn hình chính (user journey)

8 nguyên tắc thiết kế nền: (1) một con đường không ngã ba; (2) app quyết hộ phần "không biết", người dùng chỉ xác nhận; (3) trấn an trước, hướng dẫn sau; (4) đếm ngược không đếm xuôi; (5) tông giọng điềm tĩnh-tôn trọng (không emoji trong copy nghi lễ/tang); (6) tôn trọng tang chế & vùng miền là mặc định; (7) sai sót là bình thường, app đỡ lấy; (8) tầng ký ức len lỏi tự nhiên.

### User journey từ chọn dịp đến "ngày D"

**MH1 — Onboarding ấm áp** (6 câu, mỗi câu một bước): Lời chào → Dịp gì? → Vùng miền → Bao nhiêu khách/mâm? → Mấy người phụ bếp? → Mấy giờ cúng (T0)? Kết: "Đã đủ rồi. Để tôi lo phần sắp xếp."

**MH2 — Trang chủ dịp (hub):** tên dịp + đếm ngược; câu trấn an theo trạng thái; thẻ "việc nên làm bây giờ" duy nhất; dải 7 bước có tick.

**MH3 — Thực đơn:** mở ra đã có **mâm gợi ý hoàn chỉnh** (không phải trang trống); món bắt buộc khóa-mềm; nhãn độ khó + "làm trước được/sát giờ"; mâm chay riêng + mâm phụ tự bật khi dịp cần; móc ghi chú "món cha thích".

**MH4 — Chốt số lượng:** "X khách = Y mâm + Z lẻ"; 3 lựa chọn bằng lời thường (Làm tròn lên/Nấu vừa đủ/Linh hoạt); minh bạch phần dư.

**MH5 — Đi chợ:** danh sách đã gộp, nhóm theo quầy; mục **Đồ thờ/Vàng mã** nổi bật riêng; tích "đã mua"; chia người đi chợ.

**MH6 — Chuẩn bị trước ngày D:** nhắc mốc make-ahead (trước 5-10 ngày dưa hành; 1-3 ngày giò/thịt đông/bánh chưng; tối hôm trước ngâm gạo/ninh nước).

**MH7 — NGÀY D · Cook Mode** (trái tim cảm xúc): dải trấn an + đếm ngược T0; "việc của TÔI ngay bây giờ" + nút khổng lồ "Tôi xong việc này"; bảng "ai đang làm gì" (nếu ≥2 người); nhắc nhẹ đúng mốc; cảnh báo trễ 2 cấp.

**MH8 — Thủ tục cúng:** bày mâm (checklist hình ảnh) → thắp hương (số nén lẻ) → văn khấn điền sẵn (chữ to, đọc chậm, "không có chữ nào gọi là sai") → chờ hương 2/3 → hóa vàng (thần linh trước) → hạ lễ thụ lộc. Tang/giỗ: chèn "Khoảnh khắc tưởng nhớ" tùy chọn, riêng tư, sau khi mâm xong.

**MH9 — Xong & Nhìn lại:** "Bạn đã làm được"; lưu mâm + ảnh + ghi chú để năm sau; ghi nhận giữ nếp nhà.

**Tầng Ký ức gia đình** (xuyên suốt): sổ công thức nhà mình, nhật ký dịp, góc tưởng nhớ, nếp nhà.

---

## 8. Lộ trình theo giai đoạn

### MVP (lát cắt dọc một kịch bản, ship nhanh)
**Phạm vi:** GIỖ/CÚNG 49-100 NGÀY, miền BẮC, MỘT người nấu, một thiết bị.

**Gồm:**
- `packages/core`: engine scaling đầy đủ (3 nhánh divisibility + buffer + seasoning^0.85), scheduler (backward CPM + Serial SGS, chế độ 1 người), shopping-list builder, generator rule-based.
- `packages/server`: Fastify + better-sqlite3 + seed ~3-5 dịp giỗ/cúng, ~24 món cỗ Bắc có RecipeStep timing, bảng nguyên liệu.
- `packages/client`: PWA chạy đủ luồng 7 màn (Onboarding → Trang chủ → Thực đơn → Số lượng → Đi chợ → Cook Mode → Thủ tục cúng → Nhìn lại).
- Đóng gói `npm run start` + QR/mDNS.
- Văn khấn điền sẵn (nguồn kiểm chứng) + checklist nghi lễ.

**CẮT khỏi MVP:** cộng tác đa người + WebSocket + claim-task + sync outbox; vùng Trung/Nam; dịp đông khách; mâm chay-mặn song song + mâm phụ; ước tính chi phí; AI Claude; Tauri; chuyển đổi âm lịch tự động (cho nhập ngày dương).

### v1 — Cộng tác + mở rộng dịp
- Bật **cộng tác đa thiết bị** (Node WS host + claim CAS + outbox + presence + QR join) — phần lõi khác biệt sản phẩm.
- Bảng "ai đang làm gì" + giao việc theo skill/avoid + realtime re-plan.
- Vùng Trung/Nam; dịp đông khách (Tết, giỗ đầu/hết, mừng thọ, tân gia); mâm chay riêng + mâm phụ ngoài trời.
- Chuyển đổi âm lịch (lunar-javascript); ước tính chi phí.
- Editor thực đơn (thêm/bớt/đổi món + swap tương đương + recalc incremental).
- Tầng Ký ức gia đình đầy đủ.

### v1.5 — Đóng gói thân thiện
- Tauri bọc desktop (double-click để chạy) cho gia chủ không rành terminal.

### v2 — AI Claude (off-by-default)
- `SuggestionProvider` server-side: (a) re-rank candidate; (b) sinh mâm từ ngôn ngữ tự nhiên ("Mâm giỗ bố ở Nghệ An, 3 mâm, ngân sách 2 triệu, mẹ thích món cá") → validate rule-based bắt buộc; (c) giải thích & gợi ý đổi hội thoại.
- Structured-output (tool-use) ép đúng schema; prompt caching cho DISH_CATALOG; rule-based luôn là fallback offline.
- (Tương lai xa) tier cloud tùy chọn cho đa-bếp/đa-nhà qua internet.

---

## 9. Rủi ro chính & câu hỏi mở cần người dùng quyết

### Rủi ro
1. **Văn khấn sai mẫu** (theo vùng/tông phái Phật/dân gian) → app vô tình khiến "làm sai lễ", đúng nỗi sợ muốn gỡ. Cần nguồn kiểm chứng + cho sửa + miễn trừ nhẹ "tham khảo, tùy nếp nhà".
2. **Tông giọng cảm xúc trượt thành sến/xâm phạm nỗi đau.** Cần người am hiểu văn hóa + người từng chịu tang review từng câu, nhất là phần tang/tưởng nhớ.
3. **Tham số thời lượng nấu sai** so với bếp/tay nghề thực tế → slack/đường găng lệch. Cần cho người dùng hiệu chỉnh + versioned base.
4. **Định lượng base seed lệch khẩu vị/vùng miền** → mất tin tưởng số liệu đi chợ. Cần versioned base_qty + override người dùng ngay v1.
5. **Host là single point of failure** (máy con trưởng tắt) → mất điều phối. SQLite persist + CO_HOST + handoff; khuyến nghị 1 máy cố định.
6. **iOS Safari hạn chế** (Service Worker/WS nền, storage eviction → mất outbox). Cần test kỹ trên iPhone, persistent storage request.
7. **SSGS heuristic không tối ưu tuyệt đối** với ràng buộc nặng (1 lò + 1 chảo + nhiều món chiên dồn T-30). Cần buffer 15-30' + cho kéo-thả chỉnh tay.
8. **Lịch âm sai** → deadline T0 và nhắc lịch sai. Cần thư viện chuyển đổi tin cậy.

### Câu hỏi mở cần người dùng/chủ sản phẩm quyết
1. **Bối cảnh tang** xác định thế nào — hỏi thẳng (nhạy cảm) hay suy ra từ loại dịp (49 ngày/giỗ đầu)?
2. **Mức tự động lịch âm** ở MVP/v1: chỉ gợi ý ngày (đủ) hay tính chính xác giờ hoàng đạo/giờ Ngọ?
3. **Thiết bị host điển hình**: laptop (ưu tiên Tauri) hay mini-PC/Pi luôn-bật (headless + chỉ truy cập qua phone)?
4. **Anchor phong tục** (vd chè theo giới tính bé): engine tự áp hay luôn hỏi xác nhận? Ranh giới "hữu ích" vs "áp đặt văn hóa".
5. **Người phụ bếp** cần tải app/đăng nhập riêng, hay dùng chung một màn hình "bảng việc" đặt ở bếp?
6. **Mức chi tiết Task**: tách tới từng thao tác (rửa/thái/ướp) hay gộp ở công đoạn lớn? (ảnh hưởng tải nhập liệu công thức).
7. **Mua sẵn** (giò/chả/bánh chưng) đặt ở đâu để là "van giảm tải" mà không khiến người dùng thấy "làm chưa trọn"?
8. **Dish DB cho MVP**: tự seed thủ công, license kho công thức (Cooky?), hay UGC?

---

## 10. Bước tiếp theo cụ thể (để bắt đầu code)

1. **Khởi tạo monorepo** trong `/Users/nguyenthanh/Development/projects/cookafeast`: npm workspaces với 3 package (`core`, `server`, `client`). Cài TypeScript, vitest, Vite+React, Fastify, better-sqlite3, vite-plugin-pwa, Dexie.
2. **Viết `packages/core` trước (test-driven)** — đây là tài sản lõi:
   - `scaling.ts`: `effectivePersons`, `scaleLine` (3 nhánh), `buildShoppingList` (explode→gộp→quy đổi). Viết vitest với ví dụ 14 người/ROUND_UP→18 phần đã có trong nghiên cứu để chốt đúng số.
   - `scheduler.ts`: `backwardCPM` + `serialSGS` + `findEarliestFeasible`. Test với ví dụ mâm 5 món/12:00/2 người đã có.
   - `domain.ts`: toàn bộ type (Occasion, Dish, Recipe, RecipeStep, Ingredient, MenuInstance, ScheduledTask...).
3. **Seed dữ liệu** `data/seed/*.json`: ~3-5 dịp giỗ/cúng Bắc, ~24 món có RecipeStep (active/passive/machine/pred/sátGiờ — đã có bảng trong nghiên cứu), bảng nguyên liệu (Bảng A), menu-templates với functionSlots + anchors.
4. **Dựng `packages/server`**: Fastify serve static + REST `/api/*` + migration chạy lúc boot + seed nếu DB trống + in URL/QR/mDNS. WAL mode. (Chưa cần WS ở MVP một người.)
5. **Dựng `packages/client`**: 7 màn theo thứ tự luồng, dùng `packages/core` trực tiếp cho preview, gọi REST để chốt. Cook Mode + Thủ tục cúng là 2 màn đầu tư UX nhất.
6. **Hoàn thiện `npm run start`** một lệnh; test trên iPhone qua wifi nhà (quét QR).
7. **Mời 2-3 người con trưởng thật** dùng thử cho một dịp giỗ/cúng thật, đo các chỉ số cảm xúc (tỷ lệ hoàn tất luồng, số lần tra cứu ngoài app, đúng giờ cúng).
