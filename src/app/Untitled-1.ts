/**
 * KIỂU DỮ LIỆU XE DÙNG CHUNG CHO TOÀN BỘ APP EAGLE CARS
 *
 * Đây là "mẫu phiếu thông tin xe": mọi chiếc xe trong app
 * đều phải có đủ các thông tin được khai báo ở đây.
 * Khi app cần thêm thông tin mới (ảnh xe, tiền cọc, thông số...),
 * hãy bổ sung vào kiểu Car bên dưới.
 */

/**
 * Nhóm xe, dùng cho huy hiệu trên thẻ xe và bộ lọc.
 *
 * LƯU Ý TẠM THỜI: trường này đang chứa cả phân khúc ("Xe sang")
 * lẫn kiểu thân xe ("SUV", "Sedan"). Về lâu dài sẽ tách thành
 * hai trường riêng: bodyType (kiểu thân xe) và segment (phân khúc).
 */
export type CarCategory = 'Xe sang' | 'SUV' | 'Sedan';

/**
 * Hình thức thuê xe.
 * Đây là khái niệm riêng, KHÔNG phải loại xe.
 */
export type ServiceType = 'Tự lái' | 'Có lái' | 'Xe cưới';

/**
 * Thông tin của một chiếc xe.
 */
export type Car = {
  /** Mã xe dạng chữ, duy nhất, dùng trong đường dẫn. Ví dụ: 'porsche-panamera' */
  id: string;

  /** Tên xe hiển thị cho khách. Ví dụ: 'Porsche Panamera' */
  name: string;

  /** Nhóm xe (xem ghi chú ở CarCategory) */
  category: CarCategory;

  /** Giá thuê một ngày, đơn vị VNĐ, lưu dạng số. Ví dụ: 4500000 */
  pricePerDay: number;

  /** Số chỗ ngồi */
  seats: number;

  /** Các hình thức thuê mà xe hỗ trợ */
  serviceTypes: ServiceType[];

  /** Biểu tượng tạm thời, sau này sẽ thay bằng ảnh xe thật */
  icon: string;

  /** true = hiển thị trong mục "Xe nổi bật" ở trang Home */
  isFeatured: boolean;
};