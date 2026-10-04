import type { Car } from '@/types/car';

export const cars: Car[] = [
  {
    id: 'porsche-panamera',
    name: 'Porsche Panamera',
    category: 'Xe sang',
    pricePerDay: 4500000,
    seats: 4,
    serviceTypes: ['Tự lái', 'Có lái'],
    icon: '🏎️',
    isFeatured: true,
  },
  {
    id: 'bmw-530i-m-sport',
    name: 'BMW 530i M Sport',
    category: 'Xe sang',
    pricePerDay: 2500000,
    seats: 5,
    serviceTypes: ['Tự lái', 'Có lái'],
    icon: '🚘',
    isFeatured: true,
  },
  {
    id: 'mercedes-e300-amg',
    name: 'Mercedes E300 AMG',
    category: 'Xe sang',
    pricePerDay: 2000000,
    seats: 5,
    serviceTypes: ['Tự lái', 'Có lái'],
    icon: '🚙',
    isFeatured: true,
  },
  {
    id: 'mercedes-glc200',
    name: 'Mercedes GLC200',
    category: 'SUV',
    pricePerDay: 2300000,
    seats: 5,
    serviceTypes: ['Tự lái', 'Có lái'],
    icon: '🚗',
    isFeatured: false,
  },
  {
    id: 'vinfast-lux-a',
    name: 'VinFast Lux A',
    category: 'Sedan',
    pricePerDay: 1200000,
    seats: 5,
    serviceTypes: ['Tự lái', 'Có lái'],
    icon: '🚘',
    isFeatured: false,
  },
];

export const commonCarBenefits: string[] = [
  'Giao xe tận nơi',
  'Hỗ trợ 24/7',
  'Xe được vệ sinh trước khi giao',
];