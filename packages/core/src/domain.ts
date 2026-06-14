/**
 * cookafeast — Mô hình dữ liệu cốt lõi (domain model)
 *
 * Ba nguyên tắc nền (xem docs/DESIGN.md §3):
 *  1) Đơn vị nội bộ = PHẦN/người. "Mâm" chỉ là lớp hiển thị (persons = trays × perTray).
 *  2) Tách TEMPLATE (tái dùng) khỏi INSTANCE (lần nấu cụ thể).
 *  3) Tách RecipeStep ra để nuôi scheduler (mỗi bước có active/passive time + tài nguyên).
 *
 * Toàn bộ type ở đây là TS thuần, KHÔNG phụ thuộc DB hay React —
 * dùng chung cho cả packages/server và packages/client.
 */

// ───────────────────────────────────────────────────────────── Phân loại nền

/** Vùng miền — quyết định món neo bắt buộc và phong cách mâm cỗ. */
export type Region = 'BAC' | 'TRUNG' | 'NAM';

/** Loại mâm cúng. */
export type MamType = 'MAN' | 'CHAY' | 'CHUNG_SINH';

/** Nhóm dịp lớn. */
export type OccasionGroup =
  | 'TET' // Tết Nguyên đán, tất niên, giao thừa, ông Công ông Táo
  | 'GIO' // Giỗ thường / giỗ đầu / giỗ hết / cúng 49-100 ngày
  | 'RAM' // Rằm, mùng 1, Vu Lan
  | 'DOI_NGUOI' // Đầy tháng, thôi nôi, mừng thọ, tân gia, cưới
  | 'LE_HOI'; // Trung thu, các lễ khác

/**
 * Cấp quy mô — quyết định cách app hỏi số lượng.
 *  - GIA_DINH: mặc định 1 mâm (rằm, cúng Táo, 49/100 ngày).
 *  - DONG_KHACH: nhập số mâm/khách (Tết, giỗ đầu, mừng thọ, cưới).
 *  - CO_MAM_PHU: có mâm phụ ngoài trời/chúng sinh (giao thừa, Vu Lan).
 */
export type ScaleClass = 'GIA_DINH' | 'DONG_KHACH' | 'CO_MAM_PHU';

/** Vai trò của món trong một mâm cân đối. */
export type DishRole =
  | 'DAU_VI' // khai vị (giò, nem, gỏi cuốn...)
  | 'XAO' // món xào
  | 'CANH' // canh / món bát (canh măng, bóng thả, miến...)
  | 'TINH_BOT' // xôi, bánh chưng, cơm
  | 'NOM_DUA' // nộm, dưa hành, dưa góp
  | 'MON_CHINH' // gà luộc, thịt kho, cá...
  | 'TRANG_MIENG'; // chè, hoa quả, bánh

/** Cách chế biến — dùng để phạt trùng lặp khi ghép mâm. */
export type CookMethod =
  | 'LUOC'
  | 'HAP'
  | 'CHIEN'
  | 'XAO'
  | 'KHO'
  | 'NINH_HAM'
  | 'NUONG'
  | 'TRON_SONG'
  | 'DO_NAU'; // đồ nấu khác (xôi, chè)

/** Thiết bị bếp — tài nguyên hữu hạn mà scheduler phải phân bổ. */
export type Machine =
  | 'BEP' // mặt bếp gas/điện (chiếm khi đun nấu)
  | 'LO' // lò nướng (gom được nhiều khay cùng nhiệt độ)
  | 'HAP' // nồi/xửng hấp
  | 'NOI_NINH' // nồi ninh/hầm lâu (đa phần passive)
  | 'CHAO_CHIEN' // chảo chiên ngập dầu
  | 'NOI_COM'; // nồi cơm điện / nồi nấu xôi

/** Nhóm quầy ở chợ — để gom danh sách đi chợ. */
export type MarketSection =
  | 'THIT_CA' // thịt, cá, hải sản
  | 'RAU_CU' // rau củ quả tươi
  | 'DO_KHO_GIA_VI' // đồ khô, gia vị, gạo nếp
  | 'DO_THO_VANG_MA'; // hương, hoa, vàng mã, trầu cau (mục riêng, hay quên)

/** Cách một nguyên liệu được scale + làm tròn khi mua. */
export type Divisibility =
  | 'CONTINUOUS' // chia nhỏ tuỳ ý: thịt, gạo (nhân hệ số trực tiếp)
  | 'DISCRETE' // không chia nhỏ: gà nguyên con, bánh chưng (ceil)
  | 'SEASONING'; // gia vị: không scale tuyến tính (dùng ratio^0.85)

/** Kỹ năng / việc một người muốn tránh khi nấu. */
export type CookAvoid = 'KNIFE' | 'RAW_MEAT' | 'FRY';

/** Nguồn dữ liệu (seed sẵn hay người dùng tự thêm). */
export type DataSource = 'SEED' | 'USER';

/** Cách xử lý số người lẻ khi quy đổi mâm. */
export type ScaleMode =
  | 'ROUND_UP' // làm tròn lên trọn mâm (cỗ trang trọng) — mặc định
  | 'EXACT' // nấu vừa đủ số người (tiệc thân mật)
  | 'HYBRID'; // mâm trọn + phần lẻ

/** Hệ số dự phòng theo tính chất sự kiện (cỗ thường nấu dư). */
export type EventBufferType =
  | 'TRANG_TRONG' // cỗ trang trọng: dư nhiều (×1.15)
  | 'GIA_DINH' // gia đình: dư vừa (×1.05)
  | 'VUA_DU'; // nấu vừa đủ (×1.0)

// ───────────────────────────────────────────────────────────── Thư viện (TEMPLATE)

/** Một mục trong checklist thủ tục cúng. */
export interface RitualStep {
  id: string;
  /** Câu hướng dẫn, tông giọng điềm tĩnh. */
  text: string;
  /** Ghi chú/lưu ý tuỳ chọn (vd "gà quay đầu về bát hương"). */
  note?: string;
  /** Phút trước/sau giờ cúng T0 (âm = trước). Dùng để nhắc đúng lúc. */
  offsetFromServeMin?: number;
}

/** Preset một dịp cúng/lễ. */
export interface Occasion {
  id: string;
  name: string;
  group: OccasionGroup;
  /** Gợi ý ngày âm (vd "23 tháng Chạp", "rằm tháng Bảy"). v0 chỉ là gợi ý. */
  lunarHint?: string;
  mamTypes: MamType[];
  scaleClass: ScaleClass;
  /** Thời điểm trong ngày thường cúng (vd "trước giờ Ngọ", "chiều tối"). */
  timeOfDay?: string;
  hasOutdoorTray: boolean;
  defaultBufferType: EventBufferType;
  /** Ghi chú khác biệt vùng miền. */
  regionNotes?: Partial<Record<Region, string>>;
  /** Checklist thủ tục cúng mặc định cho dịp này. */
  ritualChecklist: RitualStep[];
  /** Văn khấn mẫu (có chỗ điền tên/ngày/địa chỉ bằng {{placeholder}}). */
  khanTemplate?: string;
  description?: string;
}

/** Một nguyên liệu trong thư viện. */
export interface Ingredient {
  id: string;
  name: string;
  divisibility: Divisibility;
  /** Đơn vị nội bộ để tính toán (g, ml, cái, con, lá...). */
  baseUnit: string;
  /** Đơn vị mua thực tế (kg, con, mớ, bó, quả...). */
  purchaseUnit: string;
  /** 1 purchaseUnit = bao nhiêu baseUnit (vd 1 kg = 1000 g). */
  unitConvert: number;
  /** Bước làm tròn khi mua (vd mua theo 0.5 kg → purchaseStep tính theo purchaseUnit). */
  purchaseStep: number;
  /** Tỉ lệ dùng được sau sơ chế (0..1], vd gà bỏ xương yield ~0.7. */
  yield: number;
  marketSection: MarketSection;
  /** Giá / purchaseUnit (tuỳ chọn, cho ước tính chi phí v1). */
  unitPrice?: number;
}

/** Một dòng nguyên liệu trong công thức (định lượng cho 1 PHẦN/người). */
export interface RecipeIngredient {
  ingredientId: string;
  /** Lượng tính theo baseUnit, cho ĐÚNG 1 người ăn. */
  perPerson: number;
  /** Ghi chú tuỳ chọn (vd "ướp", "trang trí"). */
  note?: string;
  /** Có scale theo số người không (mặc định true; vài thứ cố định = false). */
  scales?: boolean;
}

/**
 * Một bước nấu — ĐƠN VỊ LẬP LỊCH của scheduler.
 * Chìa khoá nấu song song: tách activeMin (giữ người) khỏi passiveMin (chỉ giữ thiết bị).
 */
export interface RecipeStep {
  id: string;
  /** Mô tả thao tác (vd "Luộc gà", "Ngâm gạo nếp"). */
  text: string;
  /** Thời gian cần NGƯỜI thao tác (phút). */
  activeMin: number;
  /** Thời gian chờ thụ động: hầm/ngâm/để nguội (phút) — không giữ người. */
  passiveMin: number;
  /** Thiết bị chiếm dụng trong suốt bước (active+passive). Null = không cần thiết bị. */
  machine?: Machine | null;
  /** Nhiệt độ lò (°C) — để gom các khay cùng nhiệt vào một mẻ. */
  ovenTempC?: number;
  /** Số người cần đồng thời cho bước này (mặc định 1). */
  needsPeople?: number;
  /** Các bước phải xong trước bước này (id trong cùng recipe). */
  predecessorIds: string[];
  /** Bước này có cần xong NÓNG sát giờ ăn không (vd luộc gà, chiên giòn). */
  mustFinishHot?: boolean;
  /** Có thể làm trước tối đa mấy NGÀY (0 = ngày D). */
  makeAheadDays?: number;

  // ── Hướng dẫn nấu chi tiết (Phase 1) — TẤT CẢ optional, engine KHÔNG đọc ──
  /** Độ khó của riêng bước này (1-3) — dùng cho phân công theo kỹ năng (Phase 3). */
  difficulty?: 1 | 2 | 3;
  /** Hướng dẫn chi tiết "làm ra sao" cho người mới nấu (markdown ngắn). */
  guidance?: string;
  /** Mẹo hay. */
  tips?: string[];
  /** Dấu hiệu "đạt" để biết bước đã xong đúng (vd "nước trong, da gà căng vàng"). */
  doneSigns?: string[];
  /** Lỗi thường gặp + cách tránh. */
  commonMistakes?: string[];
  /** Ảnh minh hoạ (URL hoặc data-URI), tuỳ chọn. */
  imageUrl?: string;
  /** Emoji gợi hình cho bước (hiển thị nhanh khi tay bận). */
  emoji?: string;
}

/** Công thức một món (mọi định lượng cho 1 PHẦN/người). */
export interface Recipe {
  id: string;
  dishId: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  /** Gợi ý/mẹo tuỳ chọn. */
  tips?: string[];
}

/** Một món trong thư viện. */
export interface Dish {
  id: string;
  name: string;
  roles: DishRole[];
  region: Region[];
  mamType: MamType[];
  /** 1 = dễ, 2 = vừa, 3 = khó. */
  difficulty: 1 | 2 | 3;
  mainIngredients: string[]; // ingredientId của nguyên liệu "đặc trưng" (để phạt trùng)
  cookMethods: CookMethod[];
  /** Có thể làm trước tối đa mấy phút (tổng hợp từ steps; tiện cho generator). */
  makeAheadMinutes: number;
  /** Phải làm sát giờ ăn (ăn nóng). */
  isNearServe: boolean;
  equipment: Machine[];
  tags: string[];
  recipeId: string;
  source: DataSource;
  /** Ước lượng độ "được ưa" trong mâm cỗ (0..1) để generator ưu tiên. */
  popularity?: number;
}

/** Một "slot" vai trò trong khung mâm + có bắt buộc không. */
export interface MenuSlot {
  role: DishRole;
  required: boolean;
  /** Nếu required và cố định món cụ thể (vd cỗ Bắc bắt buộc "gà luộc"). */
  anchorDishId?: string;
}

/** Khung mâm theo dịp × vùng miền × loại mâm. */
export interface MenuTemplate {
  id: string;
  occasionId: string;
  region: Region;
  mamType: MamType;
  name: string;
  slots: MenuSlot[];
  description?: string;
}

// ───────────────────────────────────────────────────────────── Lần nấu (INSTANCE)

/** Kết quả quy đổi số lượng. */
export interface ScalingProfile {
  /** Số người ăn / 1 mâm (mặc định 6). */
  perTray: number;
  /** Số mâm người dùng nhập (nếu nhập theo mâm). */
  trays?: number;
  /** Số khách người dùng nhập (nếu nhập theo người). */
  guestCount?: number;
  scaleMode: ScaleMode;
  bufferType: EventBufferType;
  /** Số PHẦN/người hiệu dụng sau khi áp scaleMode (chân lý để tính toán). */
  persons: number;
  /** Số mâm trọn (cho hiển thị). */
  fullTrays: number;
  /** Phần lẻ ngoài mâm trọn (cho hiển thị). */
  remainder: number;
}

export type TrayGroup = 'TRONG_NHA' | 'NGOAI_TROI' | 'CHUNG_SINH' | 'CHAY';

/** Một món đã chọn vào mâm cụ thể (snapshot công thức tại thời điểm chốt). */
export interface MenuInstanceDish {
  id: string;
  dishId: string;
  /** Bản sao công thức tại thời điểm chọn — sửa thư viện sau không làm sai mâm đã chốt. */
  recipeSnapshot: Recipe;
  dishName: string;
  required: boolean;
  trayGroup: TrayGroup;
}

/** Một mâm cỗ thực của một dịp. */
export interface MenuInstance {
  id: string;
  occasionId: string;
  region: Region;
  mamType: MamType;
  /** Giờ cúng / giờ ăn (epoch ms) = deadline T0. */
  serveAt: number;
  scaling: ScalingProfile;
  dishes: MenuInstanceDish[];
  createdAt: number;
  /** Tên hiển thị do người dùng đặt (vd "Giỗ đầu bố — 2026"). */
  title?: string;
}

// ───────────────────────────────────────────────────────────── Đi chợ

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  marketSection: MarketSection;
  /** Lượng theo baseUnit (sau khi gộp + áp yield). */
  baseQty: number;
  baseUnit: string;
  /** Lượng cần mua theo purchaseUnit (đã làm tròn purchaseStep). */
  purchaseQty: number;
  purchaseUnit: string;
  estCost?: number;
  /** Các món dùng nguyên liệu này (để người dùng hiểu vì sao mua). */
  usedBy: string[];
  checked?: boolean;
}

export interface ShoppingList {
  menuInstanceId: string;
  items: ShoppingItem[];
  totalEstCost?: number;
}

// ───────────────────────────────────────────────────────────── Lập lịch nấu

/** Một tài nguyên bếp trong phiên nấu (đếm số lượng). */
export interface KitchenResource {
  machine: Machine;
  /** Số lượng có (vd 2 mặt BEP, 1 LO, 1 HAP). */
  count: number;
}

/** Người tham gia nấu. */
export interface Person {
  id: string;
  name: string;
  /** 1 = mới tập, 2 = biết nấu, 3 = thạo. */
  skill: 1 | 2 | 3;
  avoid: CookAvoid[];
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

/**
 * Một task đã được xếp lịch — output của scheduler, đầu vào của Cook Mode.
 * Thời gian là epoch ms.
 */
export interface ScheduledTask {
  id: string;
  dishId: string;
  dishName: string;
  stepId: string;
  text: string;
  /** Thời điểm bắt đầu (epoch ms). */
  start: number;
  /** Thời điểm NGƯỜI được giải phóng (= start + activeMin). */
  activeEnd: number;
  /** Thời điểm bước hoàn tất hẳn (= start + activeMin + passiveMin). */
  end: number;
  activeMin: number;
  passiveMin: number;
  machine?: Machine | null;
  needsPeople: number;
  /** Thời điểm muộn nhất được phép bắt đầu mà vẫn kịp T0. */
  latestStart: number;
  /** Độ trễ cho phép (phút). slack = 0 ⇒ nằm trên đường găng. */
  slackMin: number;
  onCriticalPath: boolean;
  mustFinishHot: boolean;
  predecessorTaskIds: string[];
  /** Gợi ý/giao cho người nào (Phase 3 — phân công theo kỹ năng). */
  assigneeId?: string;
  /** Đã ghim do đang làm / đã xong (re-plan không xếp lại). */
  isPinned?: boolean;
}

/** Hàng đợi việc của một người (Phase 3). */
export interface PersonTaskQueue {
  personId: string;
  personName: string;
  tasks: ScheduledTask[];
}

/** Trạng thái thực thi runtime của một task (gắn lên ScheduledTask trong Cook Mode). */
export interface TaskAssignment {
  taskId: string;
  personId?: string;
  status: TaskStatus;
  /** 0..100. */
  progress: number;
  /** optimistic-lock cho claim CAS (sync đa thiết bị, v1). */
  version: number;
  /** server-stamped epoch ms. */
  updatedAt: number;
}

/** Một việc nên làm TRƯỚC ngày cúng (món để được: dưa hành, giò, bánh chưng, thịt đông). */
export interface PrepAheadTask {
  id: string;
  dishId: string;
  dishName: string;
  stepId: string;
  text: string;
  /** Nên làm trước mấy ngày. */
  makeAheadDays: number;
  activeMin: number;
  passiveMin: number;
}

/** Toàn bộ lịch nấu của một phiên. */
export interface CookSchedule {
  menuInstanceId: string;
  serveAt: number;
  /** Lịch các bước NGÀY CÚNG (đã loại bỏ các bước làm trước). */
  tasks: ScheduledTask[];
  /** Các việc nên làm trước ngày cúng (món để được). */
  prepAhead: PrepAheadTask[];
  /** Thời điểm tính lịch này (epoch ms) — để biết lịch "mới" thế nào (Phase 3 re-plan). */
  scheduledAt?: number;
  /** Thời điểm sớm nhất phải "vào bếp" trong ngày cúng. */
  earliestStartOverall: number;
  /** Lịch có kịp T0 không. */
  feasible: boolean;
  /** Nếu không kịp: makespan vượt T0 bao nhiêu phút. */
  overrunMin?: number;
  warnings: ScheduleWarning[];
}

export interface ScheduleWarning {
  level: 'INFO' | 'VANG' | 'CAM';
  taskId?: string;
  message: string;
}

// ───────────────────────────────────────────────────────────── Cộng tác đa thiết bị (Phase 2)

/** Vai trò trong một phiên nấu. */
export type CookRole = 'HOST' | 'CO_HOST' | 'MEMBER';

/** Vòng đời phiên nấu. */
export type SessionStatus = 'LOBBY' | 'COOKING' | 'DONE';

/**
 * Một người tham gia phiên nấu — MỞ RỘNG Person (tái dùng skill/avoid),
 * KHÔNG tạo khái niệm "người" thứ hai. Chế độ 1 người = phiên 1 thành viên ngầm.
 */
export interface CookSessionMember extends Person {
  role: CookRole;
  isOnline: boolean;
  /** epoch ms lần heartbeat gần nhất (để tính presence). */
  lastHeartbeat: number;
  joinedAt: number;
}

/** Một "phòng bếp" — nhiều người cùng nấu một mâm qua LAN. */
export interface CookSession {
  id: string;
  menuInstanceId: string;
  /** Mã phòng 6 ký tự để tham gia thủ công. */
  roomCode: string;
  hostMemberId: string;
  status: SessionStatus;
  createdAt: number;
  members: CookSessionMember[];
}

/** Kết quả CAS khi nhận việc. */
export interface ClaimResult {
  ok: boolean;
  /** Trạng thái task sau thao tác (nếu ok). */
  state?: TaskAssignment;
  /** Lý do từ chối (vd "đã có người khác nhận"). */
  reason?: string;
}

// ───────────────────────────────────────────────────────────── Tầng linh hồn (Phase 6)

/** Ghi chú công thức của gia đình ("món này mẹ hay nấu thế này"). */
export interface RecipeNote {
  id: string;
  dishId: string;
  text: string;
  createdAt: number;
}

/** Góc tưởng nhớ — người thân đã khuất mà mâm cỗ hướng về. */
export interface Remembrance {
  id: string;
  name: string;
  relation?: string;
  /** Ảnh dạng data-URI (offline-safe). */
  photo?: string;
  favoriteDishes?: string;
  message?: string;
  createdAt: number;
}

/** Thông tin gia đình điền sẵn cho văn khấn (dùng lại mọi dịp). Singleton. */
export interface RitualFamilyConfig {
  tenNguoiKhan?: string;
  diaChi?: string;
  hoGiaDinh?: string;
}

/** Nhật ký một dịp đã lo — để năm sau bắt đầu nhẹ nhàng. */
export interface OccasionDiary {
  id: string;
  menuId?: string;
  occasionId?: string;
  title: string;
  serveAt: number;
  note?: string;
  photo?: string;
  createdAt: number;
}

/** Ngày âm lịch đã định dạng tiếng Việt. */
export interface LunarDate {
  day: number;
  month: number;
  isLeap: boolean;
  /** vd "mùng 1 tháng Giêng" / "rằm tháng Bảy". */
  text: string;
  ganzhiYear: string;
}

// ───────────────────────────────────────────────────────────── Tổng hợp tiện ích

/** Toàn bộ dữ liệu thư viện (seed) load vào engine. */
export interface Catalog {
  occasions: Occasion[];
  dishes: Dish[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  menuTemplates: MenuTemplate[];
}
