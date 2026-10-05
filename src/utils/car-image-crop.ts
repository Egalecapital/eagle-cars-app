/**
 * TOÁN CẮT ẢNH XE (dùng chung cho khung xem trước và ảnh đầu ra).
 *
 * Đơn vị "khung": khung rộng 1, cao 1 / ASPECT. Trạng thái chỉnh:
 *   - zoom: 1 = ảnh vừa kín khung (cover); < 1 = thu nhỏ (thấy thêm nền tối);
 *   - panX / panY: độ lệch TÂM ảnh so với tâm khung (đơn vị khung).
 * Xem trước và ảnh lưu đều tính từ cùng các hàm này → ảnh lưu đúng bố cục
 * đang thấy (không cắt lại lần hai, không kéo giãn).
 */

export const CAR_IMAGE_ASPECT = 16 / 10;
/** Nền tối của khung ảnh xe — cũng là nền ảnh đầu ra khi admin thu nhỏ ảnh. */
export const CAR_IMAGE_BACKGROUND = '#0E0E0E';
const FRAME_H = 1 / CAR_IMAGE_ASPECT;

export const OUTPUT_MAX_WIDTH = 1600;
export const OUTPUT_MIN_WIDTH = 800;
export const ZOOM_MAX = 4;
/** Vùng chọn tối thiểu rộng 400px ảnh gốc (phóng tối đa ~2× khi xuất) → giữ ảnh nét. */
const MIN_SOURCE_WIDTH = 400;
/** Thu nhỏ tối đa = 60% mức "thấy trọn ảnh" (contain). */
const ZOOM_MIN_OF_CONTAIN = 0.6;

export type ImageSize = { width: number; height: number };
export type CropState = { zoom: number; panX: number; panY: number };

export const INITIAL_CROP: CropState = { zoom: 1, panX: 0, panY: 0 };

/** Đơn vị khung trên mỗi pixel ảnh gốc khi zoom = 1 (cover). */
const coverScale = (img: ImageSize) => Math.max(1 / img.width, FRAME_H / img.height);

/** Mức zoom để thấy trọn ảnh (contain), so với cover; ≤ 1. */
export function containZoom(img: ImageSize): number {
  return Math.min(1 / img.width, FRAME_H / img.height) / coverScale(img);
}

/**
 * Khoảng zoom. allowPadding = false (app iOS / Android hiện chưa ghép được nền)
 * → không thu nhỏ dưới mức kín khung.
 */
export function zoomRange(img: ImageSize, allowPadding: boolean): { min: number; max: number } {
  const max = Math.max(1, Math.min(ZOOM_MAX, 1 / coverScale(img) / MIN_SOURCE_WIDTH));

  return { min: allowPadding ? containZoom(img) * ZOOM_MIN_OF_CONTAIN : 1, max };
}

/** Kích thước ảnh hiển thị trong khung (đơn vị khung). */
export function displaySize(img: ImageSize, zoom: number): { width: number; height: number } {
  const s = coverScale(img) * zoom;

  return { width: img.width * s, height: img.height * s };
}

/**
 * Giới hạn kéo: ảnh lớn hơn khung → mép ảnh không lọt vào trong khung (không
 * hở nền ở cạnh đó); ảnh nhỏ hơn khung → ảnh không ra ngoài khung.
 */
export function clampCrop(img: ImageSize, state: CropState, allowPadding: boolean): CropState {
  const range = zoomRange(img, allowPadding);
  const zoom = Math.min(range.max, Math.max(range.min, state.zoom));
  const size = displaySize(img, zoom);
  const limitX = Math.abs(size.width - 1) / 2;
  const limitY = Math.abs(size.height - FRAME_H) / 2;
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

  return { zoom, panX: clamp(state.panX, limitX), panY: clamp(state.panY, limitY) };
}

/**
 * Đổi zoom nhưng giữ nguyên điểm `anchor` (toạ độ đơn vị khung, so với tâm
 * khung) — dùng cho con lăn chuột / chụm hai ngón.
 */
export function zoomAround(
  img: ImageSize,
  state: CropState,
  nextZoom: number,
  anchor: { x: number; y: number },
  allowPadding: boolean
): CropState {
  const range = zoomRange(img, allowPadding);
  const zoom = Math.min(range.max, Math.max(range.min, nextZoom));
  const ratio = zoom / state.zoom;

  return clampCrop(
    img,
    {
      zoom,
      panX: anchor.x - (anchor.x - state.panX) * ratio,
      panY: anchor.y - (anchor.y - state.panY) * ratio,
    },
    allowPadding
  );
}

/** Vùng ảnh gốc (pixel, có thể vượt ra ngoài ảnh = phần nền) nằm trong khung. */
export function sourceRect(img: ImageSize, state: CropState) {
  const s = coverScale(img) * state.zoom;

  return {
    x: img.width / 2 - (0.5 + state.panX) / s,
    y: img.height / 2 - (FRAME_H / 2 + state.panY) / s,
    width: 1 / s,
    height: FRAME_H / s,
  };
}

export type OutputPlan = {
  width: number;
  height: number;
  /** Phần ảnh gốc nằm trong khung (luôn nằm trong ảnh). */
  crop: { originX: number; originY: number; width: number; height: number };
  /** Kích thước phần đó trong ảnh đầu ra (cùng tỉ lệ → không méo). */
  resize: { width: number; height: number };
  /** Vị trí phần ảnh trong ảnh đầu ra; null = phủ kín (không cần nền). */
  pad: { left: number; top: number } | null;
};

/** Kế hoạch tạo ảnh đầu ra 16:10 đúng như khung xem trước. */
export function outputPlan(img: ImageSize, state: CropState): OutputPlan {
  const rect = sourceRect(img, state);
  // Không phóng to quá độ phân giải thật của vùng chọn (tối thiểu 800px để đồng bộ).
  const width = Math.round(Math.min(OUTPUT_MAX_WIDTH, Math.max(OUTPUT_MIN_WIDTH, rect.width)));
  const height = Math.round(width / CAR_IMAGE_ASPECT);
  const k = width / rect.width;

  // Khung nằm trọn trong ảnh (sai số < 0.5px ảnh gốc) → chỉ cắt + thu, không cần nền.
  const EPS = 0.5;
  if (
    rect.x >= -EPS &&
    rect.y >= -EPS &&
    rect.x + rect.width <= img.width + EPS &&
    rect.y + rect.height <= img.height + EPS
  ) {
    const originX = Math.min(img.width - 1, Math.max(0, Math.round(rect.x)));
    const originY = Math.min(img.height - 1, Math.max(0, Math.round(rect.y)));

    return {
      width,
      height,
      crop: {
        originX,
        originY,
        width: Math.max(1, Math.min(img.width - originX, Math.round(rect.width))),
        // Cao theo đúng 16:10 của bề rộng đã làm tròn → không méo khi thu / phóng.
        height: Math.max(1, Math.min(img.height - originY, Math.round(Math.round(rect.width) / CAR_IMAGE_ASPECT))),
      },
      resize: { width, height },
      pad: null,
    };
  }

  // Phần ảnh nằm trong khung, làm tròn VÀO TRONG (không bao giờ lệch ra ngoài vị trí khung).
  const startX = Math.min(img.width - 1, Math.ceil(Math.max(0, rect.x) - 1e-6));
  const startY = Math.min(img.height - 1, Math.ceil(Math.max(0, rect.y) - 1e-6));
  const endX = Math.max(startX + 1, Math.floor(Math.min(img.width, rect.x + rect.width) + 1e-6));
  const endY = Math.max(startY + 1, Math.floor(Math.min(img.height, rect.y + rect.height) + 1e-6));

  const crop = { originX: startX, originY: startY, width: endX - startX, height: endY - startY };
  const left = Math.max(0, Math.round((startX - rect.x) * k));
  const top = Math.max(0, Math.round((startY - rect.y) * k));

  return {
    width,
    height,
    crop,
    resize: {
      width: Math.max(1, Math.min(width - left, Math.round(crop.width * k))),
      height: Math.max(1, Math.min(height - top, Math.round(crop.height * k))),
    },
    pad: { left, top },
  };
}
