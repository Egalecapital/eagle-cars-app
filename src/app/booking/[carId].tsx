import {
    BookingServiceError,
    createBookingRequest,
} from '@/services/booking-service';
import { goBackOr } from '@/utils/navigation';
import { useCarAvailability } from '@/hooks/use-car-availability';
import { ContactInline } from '@/components/contact-inline';
import { CatalogError, CatalogLoading, CatalogStaleNotice } from '@/components/catalog-status';
import { useCatalogCar } from '@/hooks/use-car-catalog';
import type { BookingRequest, BookingRequestInput } from '@/types/booking';
import type { ServiceType } from '@/types/car';
import { formatDateTime as formatIsoDateTime } from '@/utils/format-date';
import { formatPricePerDay, formatVnd } from '@/utils/format-price';
import {
    addDaysToKey,
    vnDateKey,
    vnDayMonth,
    vnWallTimeToDate,
    vnWeekday,
} from '@/utils/vn-time';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const GOLD = '#D4AF37';

const ALL_SERVICE_TYPES: ServiceType[] = ['Tự lái', 'Có lái', 'Xe cưới'];

const SERVICE_DESCRIPTIONS: Record<ServiceType, string> = {
  'Tự lái': 'Khách tự cầm lái',
  'Có lái': 'Kèm tài xế chuyên nghiệp',
  'Xe cưới': 'Xe hoa cho ngày trọng đại',
};

const BOOKING_DAYS_AHEAD = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Khớp giới hạn của RPC create_booking_request (0001: tối đa 30 ngày).
const MAX_RENTAL_DAYS = 30;

type DateOption = {
  key: string;
  weekday: string;
  label: string;
};

type Schedule = {
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
};

/**
 * Tạo danh sách ngày có thể chọn, bắt đầu từ hôm nay THEO GIỜ VIỆT NAM.
 * key dạng "YYYY-MM-DD" (giờ VN), không phụ thuộc múi giờ của thiết bị.
 */
function buildDateOptions(): DateOption[] {
  const todayKey = vnDateKey(new Date());

  return Array.from({ length: BOOKING_DAYS_AHEAD }, (_, index) => {
    const key = addDaysToKey(todayKey, index);

    return {
      key,
      weekday: index === 0 ? 'Hôm nay' : vnWeekday(key),
      label: vnDayMonth(key),
    };
  });
}

/**
 * Các khung giờ nhận/trả xe: 06:00 → 22:00, mỗi 30 phút.
 */
function buildTimeOptions(): string[] {
  const times: string[] = [];

  for (let hour = 6; hour <= 22; hour++) {
    times.push(`${String(hour).padStart(2, '0')}:00`);

    if (hour < 22) {
      times.push(`${String(hour).padStart(2, '0')}:30`);
    }
  }

  return times;
}

const TIME_OPTIONS = buildTimeOptions();

/** Ngày + giờ khách chọn được hiểu là GIỜ VIỆT NAM → thời điểm tuyệt đối. */
function toDateTime(dateKey: string, time: string): Date | undefined {
  if (!dateKey || !time) {
    return undefined;
  }

  return vnWallTimeToDate(dateKey, time);
}

function formatDateTime(dateKey: string, time: string): string {
  if (!dateKey || !time) {
    return 'Chưa chọn';
  }

  const [year, month, day] = dateKey.split('-');

  return `${time} • ${day}/${month}/${year}`;
}

/**
 * Thời điểm hiện tại (ms). Chỉ gọi trong state initializer hoặc event handler, không gọi khi render.
 */
function getNowMs(): number {
  return Date.now();
}

/**
 * Số ngày thuê dự kiến: làm tròn lên theo mỗi 24 giờ, tối thiểu 1 ngày.
 */
function getRentalDays(pickup?: Date, returnAt?: Date): number | undefined {
  if (!pickup || !returnAt || returnAt <= pickup) {
    return undefined;
  }

  const diff = returnAt.getTime() - pickup.getTime();

  return Math.max(1, Math.ceil(diff / MS_PER_DAY));
}

export default function BookingScreen() {
  const router = useRouter();

  const params = useLocalSearchParams<{
    carId?: string | string[];
  }>();

  const carId = Array.isArray(params.carId) ? params.carId[0] : params.carId;

  // Xe + giá từ danh mục Supabase; server vẫn tính giá chính thức khi gửi.
  const {
    car,
    status: catalogStatus,
    isStale: catalogIsStale,
    fetchedAt: catalogFetchedAt,
    reload: reloadCatalog,
  } = useCatalogCar(carId);

  const availableServices = car
    ? ALL_SERVICE_TYPES.filter((type) => car.serviceTypes.includes(type))
    : [];

  const [dateOptions] = useState(buildDateOptions);

  const [serviceType, setServiceType] = useState<ServiceType | undefined>(
    availableServices.length === 1 ? availableServices[0] : undefined
  );

  const [schedule, setSchedule] = useState<Schedule>({
    pickupDate: '',
    pickupTime: '',
    returnDate: '',
    returnTime: '',
  });

  const [pickupLocation, setPickupLocation] = useState('');
  const [sameReturnLocation, setSameReturnLocation] = useState(true);
  const [returnLocation, setReturnLocation] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');

  const [showErrors, setShowErrors] = useState(false);

  // Mốc "hiện tại" để kiểm tra giờ nhận xe; cập nhật lại mỗi lần bấm gửi.
  const [nowMs, setNowMs] = useState(getNowMs);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Chặn bấm gửi nhiều lần liên tiếp trước khi state kịp cập nhật.
  const submittingRef = useRef(false);

  // Yêu cầu đã được Supabase lưu và trả về (số liệu chính thức từ server).
  const [savedRequest, setSavedRequest] = useState<BookingRequest | undefined>();

  // Thời gian khách chọn (giờ VN → thời điểm tuyệt đối).
  const pickupAt = toDateTime(schedule.pickupDate, schedule.pickupTime);
  const returnAt = toDateTime(schedule.returnDate, schedule.returnTime);
  const rentalDays = getRentalDays(pickupAt, returnAt);

  // Chỉ kiểm tra xe trống khi khoảng thời gian đã hợp lệ (RPC 0009, chỉ UX).
  const timesValid =
    !!pickupAt &&
    !!returnAt &&
    returnAt > pickupAt &&
    pickupAt.getTime() > nowMs &&
    !!rentalDays &&
    rentalDays <= MAX_RENTAL_DAYS;

  const availability = useCarAvailability(
    car?.id,
    timesValid ? pickupAt.toISOString() : undefined,
    timesValid ? returnAt.toISOString() : undefined
  );

  if (!car && catalogStatus === 'loading') {
    return (
      <View style={styles.center}>
        <CatalogLoading />
      </View>
    );
  }

  if (!car && catalogStatus === 'error') {
    return (
      <View style={styles.center}>
        <CatalogError onRetry={reloadCatalog} />
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => goBackOr(router, '/explore')}
        >
          <Text style={styles.backButtonText}>QUAY LẠI</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Xe tạm ngừng nhận đặt</Text>

        <Text style={styles.notFoundText}>
          Xe này hiện không nhận đặt hoặc không còn trong danh sách.
        </Text>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => goBackOr(router, '/explore')}
        >
          <Text style={styles.backButtonText}>QUAY LẠI</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const totalPrice = rentalDays ? rentalDays * car.pricePerDay : undefined;

  const finalReturnLocation = sameReturnLocation
    ? pickupLocation.trim()
    : returnLocation.trim();

  const phoneDigits = phone.replace(/\D/g, '');

  const errors = {
    serviceType: !serviceType ? 'Vui lòng chọn hình thức thuê xe.' : '',

    pickup:
      !schedule.pickupDate || !schedule.pickupTime
        ? 'Vui lòng chọn đủ ngày và giờ nhận xe.'
        : pickupAt && pickupAt.getTime() <= nowMs
          ? 'Thời gian nhận xe phải sau thời điểm hiện tại.'
          : '',

    returnAt:
      !schedule.returnDate || !schedule.returnTime
        ? 'Vui lòng chọn đủ ngày và giờ trả xe.'
        : pickupAt && returnAt && returnAt <= pickupAt
          ? 'Thời gian trả xe phải sau thời gian nhận xe.'
          : rentalDays && rentalDays > MAX_RENTAL_DAYS
            ? `Mỗi yêu cầu chỉ được thuê tối đa ${MAX_RENTAL_DAYS} ngày.`
            : '',

    pickupLocation: !pickupLocation.trim()
      ? 'Vui lòng nhập địa điểm nhận xe.'
      : '',

    returnLocation:
      !sameReturnLocation && !returnLocation.trim()
        ? 'Vui lòng nhập địa điểm trả xe.'
        : '',

    fullName: !fullName.trim() ? 'Vui lòng nhập họ và tên.' : '',

    phone: !phone.trim()
      ? 'Vui lòng nhập số điện thoại.'
      : phoneDigits.length < 9 || phoneDigits.length > 11
        ? 'Số điện thoại chưa đúng. Vui lòng kiểm tra lại.'
        : '',

    // Chỉ khoá khi CHẮC CHẮN trùng đơn confirmed; lỗi kiểm tra không khoá.
    availability:
      availability === 'unavailable'
        ? 'Xe đã có lịch trong khoảng thời gian này. Vui lòng chọn thời gian khác.'
        : '',
  };

  const errorMessages = Object.values(errors).filter(Boolean);
  const isValid = errorMessages.length === 0;

  const fieldError = (message: string) =>
    showErrors && message ? (
      <Text style={styles.fieldError}>{message}</Text>
    ) : null;

  const updateSchedule = (field: keyof Schedule, value: string) => {
    setSchedule((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    setShowErrors(true);

    const currentMs = getNowMs();
    setNowMs(currentMs);

    if (
      !isValid ||
      (pickupAt && pickupAt.getTime() <= currentMs) ||
      submittingRef.current ||
      !serviceType ||
      !pickupAt ||
      !returnAt
    ) {
      return;
    }

    // Giá, số ngày, tổng tiền, trạng thái, mã đơn do server tính.
    const input: BookingRequestInput = {
      carId: car.id,
      serviceType,
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      pickupLocation: pickupLocation.trim(),
      returnLocation: finalReturnLocation,
      customer: {
        fullName: fullName.trim(),
        phone: phone.trim(),
      },
      note: note.trim(),
    };

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');

    try {
      const saved = await createBookingRequest(input);

      if (__DEV__) {
        console.log('[Booking] Request submitted', {
          bookingId: saved.id,
          bookingCode: saved.bookingCode,
          carId: saved.carId,
          status: saved.status,
        });
      }

      setSavedRequest(saved);
    } catch (error) {
      if (__DEV__) {
        console.error('[Booking] Request failed', {
          carId: car.id,
          kind: error instanceof BookingServiceError ? error.kind : 'unknown',
          code: error instanceof BookingServiceError ? error.code : undefined,
        });
      }

      setSubmitError(
        error instanceof BookingServiceError
          ? error.userMessage
          : 'Chưa gửi được yêu cầu. Vui lòng thử lại.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const goToMyRequests = () => {
    if (router.canDismiss()) {
      router.dismissAll();
    }

    router.navigate('/requests');
  };

  // Quay về màn hình đầu stack (tabs). Nếu mở thẳng bằng deep link thì thay bằng trang chủ.
  const goHome = () => {
    if (router.canDismiss()) {
      router.dismissAll();
    } else {
      router.replace('/' as Href);
    }
  };

  if (savedRequest) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>

          <Text style={styles.successEyebrow}>EAGLE CAPITAL CARS</Text>

          <Text style={styles.successTitle}>
            Cảm ơn {savedRequest.customer.fullName}!
          </Text>

          <Text style={styles.successText}>
            Yêu cầu đặt xe của bạn đã được gửi tới Eagle Capital. Chúng tôi sẽ
            liên hệ qua số{' '}
            <Text style={styles.successHighlight}>
              {savedRequest.customer.phone}
            </Text>{' '}
            để xác nhận xe, giá chính thức và thủ tục thuê.
          </Text>

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Tóm tắt yêu cầu</Text>

            <SummaryRow label="Mã yêu cầu" value={savedRequest.bookingCode} />
            <SummaryRow label="Trạng thái" value="Chờ xác nhận" />
            <SummaryRow label="Xe" value={savedRequest.carName} />
            <SummaryRow label="Hình thức" value={savedRequest.serviceType} />
            <SummaryRow
              label="Nhận xe"
              value={formatIsoDateTime(savedRequest.pickupAt)}
            />
            <SummaryRow
              label="Trả xe"
              value={formatIsoDateTime(savedRequest.returnAt)}
            />
            <SummaryRow label="Nơi nhận" value={savedRequest.pickupLocation} />
            <SummaryRow label="Nơi trả" value={savedRequest.returnLocation} />
            <SummaryRow
              label="Số ngày"
              value={`${savedRequest.rentalDays} ngày`}
            />

            <View style={styles.divider} />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tổng dự kiến</Text>
              <Text style={styles.totalValue}>
                {formatVnd(savedRequest.estimatedTotal)}
              </Text>
            </View>
          </View>

          <View style={styles.infoNotice}>
            <Text style={styles.infoNoticeText}>
              Lưu ý: Yêu cầu đang ở trạng thái Chờ xác nhận, chưa phải đặt xe
              được xác nhận chính thức và chưa phát sinh thanh toán. Tổng tiền
              là giá dự kiến. Xe chỉ được giữ sau khi Eagle Capital xác nhận với
              bạn. Bạn có thể theo dõi yêu cầu trong mục &quot;Đơn của tôi&quot;.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.bookingButton}
            activeOpacity={0.8}
            onPress={goToMyRequests}
          >
            <Text style={styles.bookingButtonText}>XEM ĐƠN CỦA TÔI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.outlineButton}
            activeOpacity={0.8}
            onPress={goHome}
          >
            <Text style={styles.outlineButtonText}>VỀ TRANG CHỦ</Text>
          </TouchableOpacity>

          <ContactInline label="Cần hỗ trợ gấp?" />
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.topBackButton}
          onPress={() => goBackOr(router, '/explore')}
        >
          <Text style={styles.topBackText}>← Quay lại</Text>
        </TouchableOpacity>

        <Text style={styles.eyebrow}>EAGLE CAPITAL CARS</Text>
        <Text style={styles.title}>ĐẶT XE</Text>

        {catalogIsStale && <CatalogStaleNotice fetchedAt={catalogFetchedAt} />}

        {/* A. Thông tin xe */}
        <View style={styles.carCard}>
          <Image
            source={car.image}
            style={styles.carImage}
            resizeMode="cover"
          />

          <View style={styles.carInfo}>
            <Text style={styles.carName}>{car.name}</Text>

            <Text style={styles.price}>
              {formatPricePerDay(car.pricePerDay)}
            </Text>

            <Text style={styles.carMeta}>
              {car.seats} chỗ • {car.category} • {car.transmission}
            </Text>
          </View>
        </View>

        {/* B. Hình thức thuê */}
        <Text style={styles.sectionTitle}>Hình thức thuê</Text>

        <View style={styles.serviceGrid}>
          {availableServices.map((type) => {
            const active = serviceType === type;

            return (
              <TouchableOpacity
                key={type}
                style={[styles.serviceOption, active && styles.optionActive]}
                activeOpacity={0.8}
                onPress={() => setServiceType(type)}
              >
                <Text
                  style={[
                    styles.serviceOptionTitle,
                    active && styles.optionTextActive,
                  ]}
                >
                  {type}
                </Text>

                <Text
                  style={[
                    styles.serviceOptionText,
                    active && styles.optionSubTextActive,
                  ]}
                >
                  {SERVICE_DESCRIPTIONS[type]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {fieldError(errors.serviceType)}

        {/* C. Thời gian thuê */}
        <Text style={styles.sectionTitle}>Thời gian thuê</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Ngày nhận xe</Text>
          <DateSelector
            options={dateOptions}
            value={schedule.pickupDate}
            onChange={(value) => updateSchedule('pickupDate', value)}
          />

          <Text style={styles.label}>Giờ nhận xe</Text>
          <TimeSelector
            value={schedule.pickupTime}
            onChange={(value) => updateSchedule('pickupTime', value)}
          />

          {fieldError(errors.pickup)}

          <View style={styles.cardDivider} />

          <Text style={styles.label}>Ngày trả xe</Text>
          <DateSelector
            options={dateOptions}
            value={schedule.returnDate}
            onChange={(value) => updateSchedule('returnDate', value)}
          />

          <Text style={styles.label}>Giờ trả xe</Text>
          <TimeSelector
            value={schedule.returnTime}
            onChange={(value) => updateSchedule('returnTime', value)}
          />

          {fieldError(errors.returnAt)}

          {availability === 'checking' && (
            <Text style={styles.availabilityChecking}>Đang kiểm tra lịch xe…</Text>
          )}
          {availability === 'available' && (
            <Text style={styles.availabilityOk}>
              ✓ Xe còn trống trong khoảng thời gian này.
            </Text>
          )}
          {availability === 'unavailable' && (
            <Text style={styles.availabilityBusy}>
              ⚠ Xe đã có lịch trong khoảng thời gian này. Vui lòng chọn thời gian
              khác.
            </Text>
          )}
        </View>

        {/* D. Địa điểm */}
        <Text style={styles.sectionTitle}>Địa điểm</Text>

        <Text style={styles.label}>Địa điểm nhận xe *</Text>
        <TextInput
          value={pickupLocation}
          onChangeText={setPickupLocation}
          placeholder="VD: 123 Nguyễn Huệ, Quận 1"
          placeholderTextColor="#777777"
          style={[
            styles.input,
            showErrors && !!errors.pickupLocation && styles.inputError,
          ]}
        />
        {fieldError(errors.pickupLocation)}

        <TouchableOpacity
          style={styles.checkboxRow}
          activeOpacity={0.8}
          onPress={() => setSameReturnLocation((value) => !value)}
        >
          <View
            style={[
              styles.checkbox,
              sameReturnLocation && styles.checkboxChecked,
            ]}
          >
            {sameReturnLocation && <Text style={styles.checkboxTick}>✓</Text>}
          </View>

          <Text style={styles.checkboxLabel}>
            Trả xe cùng địa điểm nhận
          </Text>
        </TouchableOpacity>

        {!sameReturnLocation && (
          <>
            <Text style={styles.label}>Địa điểm trả xe *</Text>
            <TextInput
              value={returnLocation}
              onChangeText={setReturnLocation}
              placeholder="Nhập địa điểm trả xe"
              placeholderTextColor="#777777"
              style={[
                styles.input,
                showErrors && !!errors.returnLocation && styles.inputError,
              ]}
            />
            {fieldError(errors.returnLocation)}
          </>
        )}

        {/* E. Thông tin khách hàng */}
        <Text style={styles.sectionTitle}>Thông tin khách hàng</Text>

        <Text style={styles.label}>Họ và tên *</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          placeholder="Nguyễn Văn A"
          placeholderTextColor="#777777"
          autoComplete="name"
          textContentType="name"
          style={[
            styles.input,
            showErrors && !!errors.fullName && styles.inputError,
          ]}
        />
        {fieldError(errors.fullName)}

        <Text style={styles.label}>Số điện thoại *</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="09xx xxx xxx"
          placeholderTextColor="#777777"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          style={[
            styles.input,
            showErrors && !!errors.phone && styles.inputError,
          ]}
        />
        {fieldError(errors.phone)}

        <Text style={styles.label}>Ghi chú / yêu cầu thêm</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="VD: cần ghế trẻ em, trang trí xe hoa..."
          placeholderTextColor="#777777"
          multiline
          textAlignVertical="top"
          style={[styles.input, styles.noteInput]}
        />

        {/* F. Tóm tắt booking */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Tóm tắt đặt xe</Text>

          <SummaryRow label="Xe đã chọn" value={car.name} />
          <SummaryRow label="Hình thức" value={serviceType ?? 'Chưa chọn'} />
          <SummaryRow
            label="Nhận xe"
            value={formatDateTime(schedule.pickupDate, schedule.pickupTime)}
          />
          <SummaryRow
            label="Trả xe"
            value={formatDateTime(schedule.returnDate, schedule.returnTime)}
          />
          <SummaryRow
            label="Nơi nhận"
            value={pickupLocation.trim() || 'Chưa nhập'}
          />
          <SummaryRow
            label="Nơi trả"
            value={finalReturnLocation || 'Chưa nhập'}
          />
          <SummaryRow
            label="Đơn giá"
            value={formatPricePerDay(car.pricePerDay)}
          />
          <SummaryRow
            label="Số ngày dự kiến"
            value={rentalDays ? `${rentalDays} ngày` : '—'}
          />

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tổng dự kiến</Text>
            <Text style={styles.totalValue}>
              {totalPrice ? formatVnd(totalPrice) : '—'}
            </Text>
          </View>

          <Text style={styles.summaryNote}>
            Giá dự kiến. Eagle Capital sẽ xác nhận giá chính thức khi liên hệ.
          </Text>
        </View>

        {/* G. Validation */}
        {showErrors && !isValid && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxTitle}>
              Vui lòng hoàn thiện thông tin:
            </Text>

            {errorMessages.map((message) => (
              <Text key={message} style={styles.errorBoxItem}>
                • {message}
              </Text>
            ))}
          </View>
        )}

        {/* H. Nút gửi */}
        {!!submitError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxItem}>{submitError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.bookingButton,
            (submitting || availability === 'unavailable') && styles.buttonDisabled,
          ]}
          activeOpacity={0.8}
          onPress={handleSubmit}
          disabled={submitting || availability === 'unavailable'}
        >
          <Text style={styles.bookingButtonText}>
            {submitting ? 'ĐANG GỬI YÊU CẦU...' : 'GỬI YÊU CẦU ĐẶT XE'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.notice}>
          Chưa cần thanh toán. Eagle Capital sẽ liên hệ xác nhận xe, thời gian
          thuê và thủ tục trước khi hoàn tất đặt xe.
        </Text>

        <Text style={styles.notice}>
          Khi gửi yêu cầu, bạn đồng ý với{' '}
          <Text style={styles.legalLink} onPress={() => router.push('/legal/terms' as Href)}>
            Điều khoản sử dụng
          </Text>{' '}
          và{' '}
          <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy' as Href)}>
            Chính sách quyền riêng tư
          </Text>
          .
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type DateSelectorProps = {
  options: DateOption[];
  value: string;
  onChange: (value: string) => void;
};

function DateSelector({ options, value, onChange }: DateSelectorProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((option) => {
        const active = option.key === value;

        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.dateChip, active && styles.optionActive]}
            activeOpacity={0.8}
            onPress={() => onChange(option.key)}
          >
            <Text
              style={[styles.dateChipWeekday, active && styles.optionTextActive]}
            >
              {option.weekday}
            </Text>

            <Text
              style={[styles.dateChipLabel, active && styles.optionTextActive]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

type TimeSelectorProps = {
  value: string;
  onChange: (value: string) => void;
};

function TimeSelector({ value, onChange }: TimeSelectorProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {TIME_OPTIONS.map((time) => {
        const active = time === value;

        return (
          <TouchableOpacity
            key={time}
            style={[styles.timeChip, active && styles.optionActive]}
            activeOpacity={0.8}
            onPress={() => onChange(time)}
          >
            <Text
              style={[styles.timeChipText, active && styles.optionTextActive]}
            >
              {time}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

type SummaryRowProps = {
  label: string;
  value: string;
};

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legalLink: {
    color: '#D4AF37',
    fontWeight: '800',
  },

  container: {
    flex: 1,
    backgroundColor: '#080808',
  },

  content: {
    padding: 20,
    paddingTop: 65,
    paddingBottom: 100,
  },

  center: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },

  notFound: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },

  notFoundText: {
    color: '#999999',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 25,
  },

  backButton: {
    backgroundColor: GOLD,
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 14,
  },

  backButtonText: {
    color: '#080808',
    fontWeight: '900',
  },

  topBackButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },

  topBackText: {
    color: GOLD,
    fontSize: 17,
    fontWeight: '800',
  },

  eyebrow: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },

  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    marginTop: 6,
    marginBottom: 22,
  },

  carCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#303030',
  },

  carImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#202020',
  },

  carInfo: {
    padding: 18,
  },

  carName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },

  price: {
    color: GOLD,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 8,
  },

  carMeta: {
    color: '#999999',
    fontSize: 14,
    marginTop: 6,
  },

  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 30,
    marginBottom: 14,
  },

  serviceGrid: {
    gap: 10,
  },

  serviceOption: {
    backgroundColor: '#151515',
    borderWidth: 1.5,
    borderColor: '#303030',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },

  serviceOptionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },

  serviceOptionText: {
    color: '#999999',
    fontSize: 13,
    marginTop: 4,
  },

  optionActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },

  optionTextActive: {
    color: '#080808',
  },

  optionSubTextActive: {
    color: '#2A2A2A',
  },

  card: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#303030',
  },

  cardDivider: {
    height: 1,
    backgroundColor: '#292929',
    marginVertical: 18,
  },

  label: {
    color: '#BBBBBB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },

  chipRow: {
    gap: 8,
    paddingBottom: 12,
  },

  dateChip: {
    minWidth: 68,
    alignItems: 'center',
    backgroundColor: '#1D1D1D',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },

  dateChipWeekday: {
    color: '#999999',
    fontSize: 12,
    fontWeight: '700',
  },

  dateChipLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 3,
  },

  timeChip: {
    backgroundColor: '#1D1D1D',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },

  timeChipText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  input: {
    minHeight: 54,
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#303030',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 12,
  },

  inputError: {
    borderColor: '#E5534B',
  },

  noteInput: {
    minHeight: 100,
  },

  fieldError: {
    color: '#FF7B72',
    fontSize: 13,
    marginTop: -4,
    marginBottom: 12,
  },

  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 12,
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  checkboxChecked: {
    backgroundColor: GOLD,
  },

  checkboxTick: {
    color: '#080808',
    fontSize: 15,
    fontWeight: '900',
  },

  checkboxLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  summary: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 20,
    marginTop: 26,
    borderWidth: 1,
    borderColor: GOLD,
  },

  summaryTitle: {
    color: GOLD,
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 12,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 8,
  },

  summaryLabel: {
    color: '#888888',
    fontSize: 14,
  },

  summaryValue: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },

  divider: {
    height: 1,
    backgroundColor: '#333333',
    marginVertical: 12,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  totalLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },

  totalValue: {
    color: GOLD,
    fontSize: 24,
    fontWeight: '900',
  },

  summaryNote: {
    color: '#999999',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 12,
  },

  errorBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },

  errorBoxTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
  },

  errorBoxItem: {
    color: '#FFB4AE',
    fontSize: 14,
    lineHeight: 21,
  },

  bookingButton: {
    backgroundColor: GOLD,
    paddingVertical: 19,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 24,
  },

  bookingButtonText: {
    color: '#080808',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  availabilityChecking: {
    color: '#999999',
    fontSize: 13,
    marginTop: 4,
  },

  availabilityOk: {
    color: '#5CC98A',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },

  availabilityBusy: {
    color: '#FF7B72',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  outlineButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    paddingVertical: 17,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 12,
  },

  outlineButtonText: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '900',
  },

  notice: {
    color: '#777777',
    textAlign: 'center',
    marginTop: 18,
    fontSize: 13,
    lineHeight: 19,
  },

  successIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 22,
  },

  successIconText: {
    color: '#080808',
    fontSize: 42,
    fontWeight: '900',
  },

  successEyebrow: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },

  successTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
  },

  successText: {
    color: '#BBBBBB',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 12,
  },

  successHighlight: {
    color: GOLD,
    fontWeight: '900',
  },

  infoNotice: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#303030',
    padding: 16,
    marginTop: 16,
  },

  infoNoticeText: {
    color: '#999999',
    fontSize: 13,
    lineHeight: 20,
  },
});
