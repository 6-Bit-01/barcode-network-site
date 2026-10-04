// Math utilities for BARCODE: System Override
window.FILE_MANIFEST = window.FILE_MANIFEST || [];
window.FILE_MANIFEST.push({
  name: 'src/utils/math.js',
  exports: ['Vector2D', 'distance', 'lerp', 'clamp', 'randomRange', 'angleBetween'],
  dependencies: []
});

// 2D Vector class for position and velocity calculations
window.Vector2D = class Vector2D {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  // Vector arithmetic
  add(other) {
    return new Vector2D(this.x + other.x, this.y + other.y);
  }

  subtract(other) {
    return new Vector2D(this.x - other.x, this.y - other.y);
  }

  multiply(scalar) {
    return new Vector2D(this.x * scalar, this.y * scalar);
  }

  divide(scalar) {
    if (scalar === 0) return new Vector2D(0, 0);
    return new Vector2D(this.x / scalar, this.y / scalar);
  }

  // Vector properties
  magnitude() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize() {
    const mag = this.magnitude();
    if (mag === 0) return new Vector2D(0, 0);
    return this.divide(mag);
  }

  // Vector operations
  dot(other) {
    return this.x * other.x + this.y * other.y;
  }

  cross(other) {
    return this.x * other.y - this.y * other.x;
  }

  // Static utility methods
  static zero() {
    return new Vector2D(0, 0);
  }

  static up() {
    return new Vector2D(0, -1);
  }

  static down() {
    return new Vector2D(0, 1);
  }

  static left() {
    return new Vector2D(-1, 0);
  }

  static right() {
    return new Vector2D(1, 0);
  }
};

// Distance calculation between two points
window.distance = function(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
};

// Linear interpolation between two values
window.lerp = function(start, end, t) {
  return start + (end - start) * t;
};

// Clamp value between min and max
window.clamp = function(value, min, max) {
  return Math.min(Math.max(value, min), max);
};

// Random number in range (inclusive)
window.randomRange = function(min, max) {
  return Math.random() * (max - min) + min;
};

// Angle in radians between two points
window.angleBetween = function(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
};

// AABB collision detection
window.aabbCollision = function(rect1, rect2) {
  return rect1.x < rect2.x + rect2.width &&
         rect1.x + rect1.width > rect2.x &&
         rect1.y < rect2.y + rect2.height &&
         rect1.y + rect1.height > rect2.y;
};

// Circle collision detection
window.circleCollision = function(x1, y1, r1, x2, y2, r2) {
  const dist = window.distance(x1, y1, x2, y2);
  return dist < r1 + r2;
};