import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  CAR_CATEGORIES,
  CAR_ID_PATTERN,
  CAR_LIMITS,
  FUEL_TYPES,
  SERVICE_OPTIONS,
  TRANSMISSIONS,
} from '@/constants/car-options';
import type { FleetCar, FleetCarInput } from '@/services/fleet-admin-service';
import type { CarCategory, FuelType, ServiceTypeKey, TransmissionType } from '@/types/car';
import { formatVnd } from '@/utils/format-price';

const GOLD = '#D4AF37';

type FleetCarFormProps = {
  /** Có = sửa xe này; không có = thêm xe mới (nhập mã xe). */
  car?: FleetCar;
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: FleetCarInput, newCarId: string) => void;
};

/** "Toyota Camry 2.5Q" → "toyota-camry-2-5q" (gợi ý mã xe). */
export function slugifyCarId(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CAR_LIMITS.idMax)
    .replace(/-+$/g, '');
}

const digitsOf = (text: string) => text.replace(/\D/g, '');
/** '' → null; số → number. */
const optionalInt = (text: string) => (digitsOf(text) === '' ? null : Number(digitsOf(text)));
const textOf = (value: number | null | undefined) => (value == null ? '' : String(value));

/** Form thêm / sửa xe của admin; kiểm tra giống server (server vẫn kiểm tra lại). */
export function FleetCarForm({ car, busy, submitLabel, onSubmit }: FleetCarFormProps) {
  const [carId, setCarId] = useState('');
  const [carIdEdited, setCarIdEdited] = useState(false);
  const [name, setName] = useState(car?.name ?? '');
  const [price, setPrice] = useState(textOf(car?.pricePerDay));
  const [brand, setBrand] = useState(car?.brand ?? '');
  const [model, setModel] = useState(car?.model ?? '');
  const [year, setYear] = useState(textOf(car?.year));
  const [category, setCategory] = useState<CarCategory>(car?.category ?? 'Sedan');
  const [seats, setSeats] = useState(textOf(car?.seats ?? 5));
  const [fuelType, setFuelType] = useState<FuelType>(car?.fuelType ?? 'Xăng');
  const [transmission, setTransmission] = useState<TransmissionType>(car?.transmission ?? 'Tự động');
  const [services, setServices] = useState<ServiceTypeKey[]>(car?.serviceTypes ?? ['self_drive']);
  const [description, setDescription] = useState(car?.description ?? '');
  const [features, setFeatures] = useState<string[]>(car?.features ?? []);
  const [featureText, setFeatureText] = useState('');
  const [isFeatured, setIsFeatured] = useState(car?.isFeatured ?? false);
  const [sortOrder, setSortOrder] = useState(textOf(car?.sortOrder ?? 100));
  const [deposit, setDeposit] = useState(textOf(car?.depositAmount));
  const [kmLimit, setKmLimit] = useState(textOf(car?.kmLimitPerDay));
  const [extraKmFee, setExtraKmFee] = useState(textOf(car?.extraKmFee));
  const [showErrors, setShowErrors] = useState(false);

  const isCreate = !car;
  const effectiveId = carIdEdited ? carId.trim() : slugifyCarId(name);
  const priceValue = optionalInt(price);
  const yearValue = optionalInt(year);
  const seatsValue = optionalInt(seats);
  const sortValue = optionalInt(sortOrder);
  const depositValue = optionalInt(deposit);
  const kmValue = optionalInt(kmLimit);
  const feeValue = optionalInt(extraKmFee);

  const problems = [
    isCreate &&
      (effectiveId.length < CAR_LIMITS.idMin ||
        effectiveId.length > CAR_LIMITS.idMax ||
        !CAR_ID_PATTERN.test(effectiveId) ||
        effectiveId === 'new') &&
      'Mã xe cần 3–60 ký tự: chữ thường không dấu, số, gạch nối (vd: toyota-camry-2023).',
    (name.trim().length < 1 || name.trim().length > CAR_LIMITS.nameMax) && 'Tên xe cần 1–120 ký tự.',
    (priceValue == null || priceValue < 1 || priceValue > CAR_LIMITS.priceMax) &&
      'Giá/ngày phải từ 1đ đến 1.000.000.000đ.',
    brand.trim().length > CAR_LIMITS.brandMax && 'Hãng xe tối đa 60 ký tự.',
    model.trim().length > CAR_LIMITS.modelMax && 'Dòng xe (model) tối đa 80 ký tự.',
    yearValue != null &&
      (yearValue < CAR_LIMITS.yearMin || yearValue > CAR_LIMITS.yearMax) &&
      'Năm sản xuất phải từ 1990 đến 2100.',
    (seatsValue == null || seatsValue < CAR_LIMITS.seatsMin || seatsValue > CAR_LIMITS.seatsMax) &&
      'Số chỗ phải từ 2 đến 50.',
    services.length === 0 && 'Chọn ít nhất một hình thức thuê.',
    description.trim().length > CAR_LIMITS.descriptionMax && 'Mô tả tối đa 2000 ký tự.',
    (sortValue == null || sortValue > CAR_LIMITS.sortMax) && 'Thứ tự hiển thị từ 0 đến 10.000.',
    depositValue != null && depositValue > CAR_LIMITS.depositMax && 'Tiền cọc quá lớn.',
    kmValue != null && (kmValue < 1 || kmValue > CAR_LIMITS.kmMax) && 'Giới hạn km/ngày từ 1 đến 100.000.',
    feeValue != null && feeValue > CAR_LIMITS.extraKmFeeMax && 'Phụ phí km vượt quá lớn.',
  ].filter(Boolean) as string[];

  const addFeature = () => {
    const value = featureText.trim();

    if (!value || value.length > CAR_LIMITS.featureMax || features.length >= CAR_LIMITS.featuresMax) return;
    if (!features.includes(value)) setFeatures([...features, value]);
    setFeatureText('');
  };

  const toggleService = (key: ServiceTypeKey) =>
    setServices((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : SERVICE_OPTIONS.map((option) => option.key).filter((item) => item === key || current.includes(item))
    );

  const submit = () => {
    setShowErrors(true);

    if (busy || problems.length > 0 || priceValue == null || seatsValue == null || sortValue == null) return;

    onSubmit(
      {
        name,
        pricePerDay: priceValue,
        brand,
        model,
        year: yearValue,
        category,
        seats: seatsValue,
        fuelType,
        transmission,
        serviceTypes: services,
        description,
        features,
        isFeatured,
        sortOrder: sortValue,
        depositAmount: depositValue,
        kmLimitPerDay: kmValue,
        extraKmFee: feeValue,
      },
      effectiveId
    );
  };

  return (
    <View>
      <Field label="Tên xe hiển thị *" value={name} onChange={setName} placeholder="Toyota Camry 2.5Q" />

      {isCreate && (
        <>
          <Field
            label="Mã xe (đường dẫn, không đổi được sau khi tạo)"
            value={effectiveId}
            onChange={(text) => {
              setCarIdEdited(true);
              setCarId(text.toLowerCase());
            }}
            placeholder="toyota-camry-2023"
            autoCapitalize="none"
          />
          <Text style={styles.hint}>Tự gợi ý theo tên xe; sửa nếu muốn.</Text>
        </>
      )}

      <Field label="Giá/ngày (VNĐ) *" value={price} onChange={setPrice} keyboard="number-pad" placeholder="2500000" />
      {priceValue != null && priceValue > 0 && <Text style={styles.preview}>{formatVnd(priceValue)}/ngày</Text>}
      {!isCreate && priceValue != null && priceValue !== car?.pricePerDay && (
        <Text style={styles.hint}>Giá mới chỉ áp dụng cho đơn tạo sau khi lưu; đơn đã có giữ giá lúc đặt.</Text>
      )}

      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Hãng" value={brand} onChange={setBrand} placeholder="Toyota" />
        </View>
        <View style={styles.flex}>
          <Field label="Năm SX" value={year} onChange={setYear} keyboard="number-pad" placeholder="2023" />
        </View>
      </View>
      <Field label="Dòng xe (model)" value={model} onChange={setModel} placeholder="Camry 2.5Q" />

      <Chips label="Phân khúc" options={CAR_CATEGORIES} value={category} onChange={setCategory} />

      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Số chỗ *" value={seats} onChange={setSeats} keyboard="number-pad" />
        </View>
        <View style={styles.flex}>
          <Field label="Thứ tự hiển thị" value={sortOrder} onChange={setSortOrder} keyboard="number-pad" />
        </View>
      </View>
      <Text style={styles.hint}>Thứ tự: số nhỏ hiện trước (0–10.000).</Text>

      <Chips label="Nhiên liệu" options={FUEL_TYPES} value={fuelType} onChange={setFuelType} />
      <Chips label="Hộp số" options={TRANSMISSIONS} value={transmission} onChange={setTransmission} />

      <Text style={styles.label}>Hình thức thuê * (chọn một hoặc nhiều)</Text>
      <View style={styles.chips}>
        {SERVICE_OPTIONS.map((option) => {
          const active = services.includes(option.key);

          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggleService(option.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {active ? '✓ ' : ''}
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!isCreate && (
        <Text style={styles.hint}>Bỏ một hình thức chỉ chặn đơn mới; đơn đã có vẫn xử lý bình thường.</Text>
      )}

      <Text style={styles.label}>Mô tả</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="Giới thiệu ngắn về xe"
        placeholderTextColor="#666666"
        style={[styles.input, styles.multiline]}
        maxLength={CAR_LIMITS.descriptionMax}
      />

      <Text style={styles.label}>Tính năng nổi bật ({features.length}/20)</Text>
      {features.map((feature) => (
        <View key={feature} style={styles.featureRow}>
          <Text style={styles.featureText}>✓ {feature}</Text>
          <TouchableOpacity onPress={() => setFeatures(features.filter((item) => item !== feature))} hitSlop={8}>
            <Text style={styles.featureRemove}>✕ Xoá</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={[styles.row, styles.addRow]}>
        <TextInput
          value={featureText}
          onChangeText={setFeatureText}
          onSubmitEditing={addFeature}
          placeholder="Vd: Cửa sổ trời"
          placeholderTextColor="#666666"
          style={[styles.input, styles.flex]}
          maxLength={CAR_LIMITS.featureMax}
        />
        <TouchableOpacity
          style={[styles.addButton, (!featureText.trim() || features.length >= 20) && styles.disabled]}
          onPress={addFeature}
          disabled={!featureText.trim() || features.length >= 20}
        >
          <Text style={styles.addButtonText}>+ THÊM</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Xe nổi bật (hiện ở Trang chủ)</Text>
        <Switch value={isFeatured} onValueChange={setIsFeatured} trackColor={{ true: GOLD }} />
      </View>

      <Text style={styles.section}>Điều kiện thuê (để trống = hiển thị “Liên hệ”)</Text>
      <Field label="Tiền cọc (VNĐ)" value={deposit} onChange={setDeposit} keyboard="number-pad" placeholder="5000000" />
      {depositValue != null && <Text style={styles.preview}>{depositValue === 0 ? 'Không cần cọc' : formatVnd(depositValue)}</Text>}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Giới hạn km/ngày" value={kmLimit} onChange={setKmLimit} keyboard="number-pad" placeholder="300" />
        </View>
        <View style={styles.flex}>
          <Field label="Phụ phí km vượt (đ/km)" value={extraKmFee} onChange={setExtraKmFee} keyboard="number-pad" placeholder="5000" />
        </View>
      </View>

      {showErrors && problems.length > 0 && (
        <View style={styles.problemBox}>
          {problems.map((problem) => (
            <Text key={problem} style={styles.problemText}>
              • {problem}
            </Text>
          ))}
        </View>
      )}

      <TouchableOpacity style={[styles.submit, busy && styles.disabled]} onPress={submit} disabled={busy}>
        <Text style={styles.submitText}>{busy ? 'ĐANG LƯU…' : submitLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  keyboard?: 'number-pad';
  autoCapitalize?: 'none';
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#666666"
        keyboardType={keyboard}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCapitalize === 'none' ? false : undefined}
        style={styles.input}
      />
    </>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => (
          <TouchableOpacity
            key={option}
            style={[styles.chip, value === option && styles.chipActive]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.chipText, value === option && styles.chipTextActive]}>{option}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  label: { color: '#BBBBBB', fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  section: { color: GOLD, fontSize: 15, fontWeight: '900', marginTop: 22 },
  hint: { color: '#888888', fontSize: 12, lineHeight: 17, marginTop: 5 },
  preview: { color: '#5CC98A', fontSize: 13, marginTop: 5 },
  input: {
    minHeight: 48,
    backgroundColor: '#0E0E0E',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 16,
  },
  multiline: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#444444',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#111111',
  },
  chipActive: { backgroundColor: GOLD, borderColor: GOLD },
  chipText: { color: '#DDDDDD', fontWeight: '700' },
  chipTextActive: { color: '#080808' },
  featureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
  },
  featureText: { color: '#FFFFFF', fontSize: 14, flexShrink: 1 },
  featureRemove: { color: '#FF8A80', fontSize: 13, fontWeight: '800' },
  addButton: {
    borderWidth: 1.5,
    borderColor: GOLD,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  addRow: { marginTop: 8 },
  addButtonText: { color: GOLD, fontWeight: '900' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
  },
  switchLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  problemBox: {
    backgroundColor: '#2A1414',
    borderWidth: 1,
    borderColor: '#E5534B',
    borderRadius: 12,
    padding: 12,
    marginTop: 18,
  },
  problemText: { color: '#FFB4AE', fontSize: 13, lineHeight: 20 },
  submit: { backgroundColor: GOLD, paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 20 },
  submitText: { color: '#080808', fontWeight: '900', fontSize: 15 },
  disabled: { opacity: 0.5 },
});
