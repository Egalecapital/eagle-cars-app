import { useEffect, useRef, useState } from 'react';
import {
  type GestureResponderEvent,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  CAR_IMAGE_ASPECT,
  CAR_IMAGE_BACKGROUND,
  clampCrop,
  type CropState,
  displaySize,
  INITIAL_CROP,
  type ImageSize,
  outputPlan,
  zoomAround,
  zoomRange,
} from '@/utils/car-image-crop';

const GOLD = '#D4AF37';
const ZOOM_STEP = 1.1;

type CarImageEditorProps = {
  image: ImageSize & { uri: string };
  /** false = app iOS / Android (chưa ghép nền) → không thu nhỏ dưới mức kín khung. */
  allowPadding: boolean;
  busy: boolean;
  onSave: (crop: CropState) => void;
  onCancel: () => void;
  /** Đang kéo / chụm ảnh → màn cha tạm khoá cuộn. */
  onGestureActive?: (active: boolean) => void;
};

type Gesture = {
  x: number;
  y: number;
  crop: CropState;
  pinch: { distance: number; crop: CropState } | null;
};

/**
 * Trình chỉnh ảnh xe 16:10: kéo để căn, zoom bằng thanh trượt / nút − + /
 * con lăn chuột (web) / chụm hai ngón (app). Khung chính là ảnh khách sẽ thấy;
 * phần trống khi thu nhỏ là nền tối (không kéo giãn ảnh).
 */
export function CarImageEditor({ image, allowPadding, busy, onSave, onCancel, onGestureActive }: CarImageEditorProps) {
  const [crop, setCrop] = useState<CropState>(INITIAL_CROP);
  const [frameWidth, setFrameWidth] = useState(0);
  const range = zoomRange(image, allowPadding);
  const plan = outputPlan(image, crop);
  const size = displaySize(image, crop.zoom);
  const gesture = useRef<Gesture | null>(null);

  const setZoom = (zoom: number) =>
    setCrop((current) => zoomAround(image, current, zoom, { x: 0, y: 0 }, allowPadding));

  /** Vị trí trong khung (đơn vị khung, so với tâm khung). */
  const toFrame = (locationX: number, locationY: number) => ({
    x: locationX / frameWidth - 0.5,
    y: locationY / frameWidth - 0.5 / CAR_IMAGE_ASPECT,
  });

  const onGrant = (event: GestureResponderEvent) => {
    gesture.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, crop, pinch: null };
    onGestureActive?.(true);
  };

  const onMove = (event: GestureResponderEvent) => {
    const current = gesture.current;
    if (!current || !frameWidth) return;

    const touches = event.nativeEvent.touches ?? [];

    if (touches.length >= 2) {
      // Chụm hai ngón: zoom quanh điểm giữa hai ngón.
      const [a, b] = touches;
      const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

      if (!current.pinch) {
        current.pinch = { distance, crop };
        return;
      }

      const anchor = toFrame((a.locationX + b.locationX) / 2, (a.locationY + b.locationY) / 2);
      setCrop(
        zoomAround(image, current.pinch.crop, current.pinch.crop.zoom * (distance / current.pinch.distance), anchor, allowPadding)
      );
      return;
    }

    if (current.pinch) {
      // Vừa nhấc một ngón: tiếp tục kéo từ vị trí hiện tại.
      gesture.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, crop, pinch: null };
      return;
    }

    const dx = (event.nativeEvent.pageX - current.x) / frameWidth;
    const dy = (event.nativeEvent.pageY - current.y) / frameWidth;
    setCrop(clampCrop(image, { ...current.crop, panX: current.crop.panX + dx, panY: current.crop.panY + dy }, allowPadding));
  };

  const onEnd = () => {
    gesture.current = null;
    onGestureActive?.(false);
  };

  // Web: con lăn chuột zoom quanh vị trí con trỏ (không cuộn trang).
  const frameRef = useRef<View>(null);
  const wheelState = useRef({ frameWidth, image, allowPadding });
  useEffect(() => {
    wheelState.current = { frameWidth, image, allowPadding };
  });
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const node = frameRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { frameWidth: width, image: img, allowPadding: pad } = wheelState.current;
      if (!width) return;

      const box = node.getBoundingClientRect();
      const anchor = {
        x: (event.clientX - box.left) / width - 0.5,
        y: (event.clientY - box.top) / width - 0.5 / CAR_IMAGE_ASPECT,
      };
      const steps = Math.min(3, Math.max(1, Math.abs(event.deltaY) / 100));
      const factor = Math.pow(ZOOM_STEP, -Math.sign(event.deltaY) * steps);
      setCrop((current) => zoomAround(img, current, current.zoom * factor, anchor, pad));
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  const left = (0.5 + crop.panX - size.width / 2) * frameWidth;
  const top = (0.5 / CAR_IMAGE_ASPECT + crop.panY - size.height / 2) * frameWidth;

  return (
    <View>
      <View style={styles.frameBorder}>
        <View
          ref={frameRef}
          style={[styles.frame, Platform.OS === 'web' && styles.webFrame]}
          onLayout={(event) => setFrameWidth(event.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => !busy}
          onMoveShouldSetResponder={() => !busy}
          onStartShouldSetResponderCapture={() => !busy}
          onMoveShouldSetResponderCapture={() => !busy}
          onResponderTerminationRequest={() => false}
          onResponderGrant={onGrant}
          onResponderMove={onMove}
          onResponderRelease={onEnd}
          onResponderTerminate={onEnd}
          testID="car-image-editor-frame"
        >
          {frameWidth > 0 && (
            <Image
              source={{ uri: image.uri }}
              resizeMode="stretch"
              style={[
                styles.image,
                { left, top, width: size.width * frameWidth, height: size.height * frameWidth },
              ]}
            />
          )}
        </View>
      </View>
      <Text style={styles.hint}>
        {Platform.OS === 'web'
          ? 'Kéo ảnh để căn chỉnh, lăn chuột trên ảnh để zoom. Khung này chính là ảnh khách sẽ thấy.'
          : 'Kéo ảnh để căn chỉnh, chụm hai ngón để zoom. Khung này chính là ảnh khách sẽ thấy.'}
      </Text>

      <View style={styles.zoomRow}>
        <RoundButton
          label="−"
          disabled={busy || crop.zoom <= range.min + 1e-6}
          onPress={() => setZoom(crop.zoom / ZOOM_STEP)}
        />
        <ZoomSlider
          value={crop.zoom}
          min={range.min}
          max={range.max}
          disabled={busy}
          onChange={setZoom}
          onGestureActive={onGestureActive}
        />
        <RoundButton
          label="+"
          disabled={busy || crop.zoom >= range.max - 1e-6}
          onPress={() => setZoom(crop.zoom * ZOOM_STEP)}
        />
      </View>
      <Text style={styles.zoomText} testID="car-image-editor-zoom">
        Zoom {Math.round(crop.zoom * 100)}% (100% = ảnh vừa kín khung)
      </Text>

      <View style={styles.row}>
        <TouchableOpacity style={[styles.outlineButton, styles.flex]} disabled={busy} onPress={() => setCrop(INITIAL_CROP)}>
          <Text style={styles.outlineText}>ĐẶT LẠI</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.outlineButton, styles.flex]}
          disabled={busy}
          onPress={() => setCrop((current) => clampCrop(image, { ...current, panX: 0, panY: 0 }, allowPadding))}
        >
          <Text style={styles.outlineText}>CĂN GIỮA</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.info}>
        Ảnh gốc: {image.width}×{image.height}px · Ảnh lưu: {plan.width}×{plan.height}px (16:10, JPEG)
        {!allowPadding ? ' · Trên app chỉ zoom từ 100% (kín khung).' : ''}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.goldButton, styles.flex, busy && styles.disabled]}
          disabled={busy}
          onPress={() => onSave(crop)}
        >
          <Text style={styles.goldText}>{busy ? 'ĐANG LƯU…' : 'LƯU ẢNH NÀY'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.outlineButton, styles.flex]} disabled={busy} onPress={onCancel}>
          <Text style={styles.outlineText}>HUỶ</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RoundButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.round, disabled && styles.disabled]} disabled={disabled} onPress={onPress} hitSlop={6}>
      <Text style={styles.roundText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Thanh trượt zoom (thang log: 50% → 100% → 200% cách đều nhau). */
function ZoomSlider({
  value,
  min,
  max,
  disabled,
  onChange,
  onGestureActive,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (zoom: number) => void;
  onGestureActive?: (active: boolean) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const drag = useRef<{ pageX: number; t: number } | null>(null);
  const toT = (zoom: number) => (max > min ? Math.log(zoom / min) / Math.log(max / min) : 0);
  const fromT = (t: number) => min * Math.pow(max / min, Math.min(1, Math.max(0, t)));
  const t = toT(value);

  const onGrant = (event: GestureResponderEvent) => {
    if (!trackWidth) return;
    const startT = event.nativeEvent.locationX / trackWidth;
    drag.current = { pageX: event.nativeEvent.pageX, t: startT };
    onChange(fromT(startT));
    onGestureActive?.(true);
  };

  const onMove = (event: GestureResponderEvent) => {
    if (!drag.current || !trackWidth) return;
    onChange(fromT(drag.current.t + (event.nativeEvent.pageX - drag.current.pageX) / trackWidth));
  };

  const onEnd = () => {
    drag.current = null;
    onGestureActive?.(false);
  };

  return (
    <View
      style={styles.sliderHit}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
      accessibilityRole="adjustable"
      accessibilityLabel="Zoom ảnh"
      accessibilityValue={{ text: `${Math.round(value * 100)}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => onChange(fromT(t + (event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)))}
      testID="car-image-editor-slider"
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.trackFill, { width: `${t * 100}%` }]} />
      </View>
      {trackWidth > 0 && <View pointerEvents="none" style={[styles.thumb, { left: t * trackWidth - 11 }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Viền nằm ở khung ngoài: vùng đo / vẽ ảnh bên trong đúng bằng vùng ảnh đầu ra.
  frameBorder: { borderRadius: 16, borderWidth: 1, borderColor: GOLD, overflow: 'hidden' },
  frame: {
    width: '100%',
    aspectRatio: CAR_IMAGE_ASPECT,
    backgroundColor: CAR_IMAGE_BACKGROUND,
    overflow: 'hidden',
  },
  webFrame: { cursor: 'grab', userSelect: 'none', touchAction: 'none' } as object,
  image: { position: 'absolute', pointerEvents: 'none' },
  hint: { color: '#888888', fontSize: 12, lineHeight: 17, marginTop: 8 },
  zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  zoomText: { color: '#CCCCCC', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: { color: GOLD, fontSize: 22, fontWeight: '900', lineHeight: 24 },
  sliderHit: { flex: 1, height: 40, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#333333', overflow: 'hidden' },
  trackFill: { height: 6, backgroundColor: GOLD },
  thumb: {
    position: 'absolute',
    top: 9,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: GOLD,
    borderWidth: 2,
    borderColor: '#080808',
  },
  info: { color: '#999999', fontSize: 12, lineHeight: 17, marginTop: 10 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  flex: { flex: 1 },
  goldButton: { backgroundColor: GOLD, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  goldText: { color: '#080808', fontWeight: '900' },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: '#777777',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  outlineText: { color: '#CCCCCC', fontWeight: '900' },
  disabled: { opacity: 0.5 },
});
