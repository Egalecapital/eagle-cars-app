import type { Car } from '@/types/car';

export const cars: Car[] = [
  {
    id: 'porsche-panamera',
    name: 'Porsche Panamera 4 Sport Turismo',
    brand: 'Porsche',
    model: 'Panamera 4 Sport Turismo',
    year: 2019,

    category: 'Xe sang',

    pricePerDay: 4500000,

    seats: 4,
    fuelType: 'Xăng',
    transmission: 'Tự động',

    serviceTypes: ['Tự lái', 'Có lái', 'Xe cưới'],

    image: require('../../assets/images/cars/porsche-panamera.webp'),

    description:
      'Mẫu xe sang thể thao cao cấp dành cho những hành trình cần sự khác biệt, đẳng cấp và trải nghiệm lái ấn tượng.',

    features: [
      'Nội thất cao cấp',
      'Không gian sang trọng',
      'Phù hợp gặp đối tác',
      'Phù hợp sự kiện và xe cưới',
    ],

    isFeatured: true,
  },

  {
    id: 'bmw-530i-m-sport',
    name: 'BMW 530i M Sport',
    brand: 'BMW',
    model: '530i M Sport',
    year: 2021,

    category: 'Xe sang',

    pricePerDay: 2500000,

    seats: 5,
    fuelType: 'Xăng',
    transmission: 'Tự động',

    serviceTypes: ['Tự lái', 'Có lái', 'Xe cưới'],

    image: require('../../assets/images/cars/bmw-530i.jpg'),

    description:
      'Sedan hạng sang mang phong cách thể thao, phù hợp đi công tác, gặp đối tác, du lịch và các sự kiện quan trọng.',

    features: [
      'Phong cách M Sport',
      'Không gian 5 chỗ',
      'Vận hành thể thao',
      'Phù hợp công việc và sự kiện',
    ],

    isFeatured: true,
  },

  {
    id: 'mercedes-e300-amg',
    name: 'Mercedes-Benz E300 AMG',
    brand: 'Mercedes-Benz',
    model: 'E300 AMG',
    year: 2017,

    category: 'Xe sang',

    pricePerDay: 2000000,

    seats: 5,
    fuelType: 'Xăng',
    transmission: 'Tự động',

    serviceTypes: ['Tự lái', 'Có lái', 'Xe cưới'],

    image: require('../../assets/images/cars/mercedes-e300.jpg'),

    description:
      'Sedan Mercedes-Benz sang trọng, phù hợp tiếp khách, gặp đối tác, đi sự kiện và sử dụng trong những dịp quan trọng.',

    features: [
      'Thiết kế sang trọng',
      'Nội thất cao cấp',
      'Không gian 5 chỗ',
      'Phù hợp công tác và xe cưới',
    ],

    isFeatured: true,
  },

  {
    id: 'mercedes-glc200',
    name: 'Mercedes-Benz GLC 200',
    brand: 'Mercedes-Benz',
    model: 'GLC 200',
    year: 2022,

    category: 'SUV',

    pricePerDay: 2300000,

    seats: 5,
    fuelType: 'Xăng',
    transmission: 'Tự động',

    serviceTypes: ['Tự lái', 'Có lái', 'Xe cưới'],

    image: require('../../assets/images/cars/mercedes-glc200.jpg'),

    description:
      'SUV hạng sang 5 chỗ cân bằng giữa sự sang trọng, tiện dụng và không gian phù hợp cho gia đình hoặc công việc.',

    features: [
      'SUV 5 chỗ',
      'Không gian rộng rãi',
      'Phù hợp gia đình',
      'Phù hợp công tác và sự kiện',
    ],

    isFeatured: false,
  },

  {
    id: 'vinfast-lux-a',
    name: 'VinFast Lux A',
    brand: 'VinFast',
    model: 'Lux A',
    year: 2021,

    category: 'Sedan',

    pricePerDay: 1200000,

    seats: 5,
    fuelType: 'Xăng',
    transmission: 'Tự động',

    serviceTypes: ['Tự lái', 'Có lái', 'Xe cưới'],

    image: require('../../assets/images/cars/vinfast-lux-a.jpg'),

    description:
      'Sedan 5 chỗ phù hợp nhu cầu tự lái hằng ngày, công tác, về quê và những chuyến đi cùng gia đình.',

    features: [
      'Sedan 5 chỗ',
      'Không gian thoải mái',
      'Phù hợp tự lái',
      'Phù hợp đi công tác và gia đình',
    ],

    isFeatured: false,
  },
];

export const commonCarBenefits: string[] = [
  'Giao xe tận nơi',
  'Hỗ trợ 24/7',
  'Xe được vệ sinh trước khi giao',
];