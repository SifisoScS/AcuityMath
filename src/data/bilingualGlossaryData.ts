import { AgeTier } from '../types';

export interface BilingualGlossaryTerm {
  id: string;
  termEn: string;
  termEs: string;
  tier: AgeTier;
  definitionEn: string;
  definitionEs: string;
  exampleEn: string;
  exampleEs: string;
  category: 'Arithmetic' | 'Geometry' | 'Algebra' | 'Calculus' | 'Foundations';
}

export const BILINGUAL_GLOSSARY: BilingualGlossaryTerm[] = [
  // Early Sprouts (Ages 3-5)
  {
    id: 'count',
    termEn: 'Count',
    termEs: 'Contar',
    tier: 'early',
    category: 'Foundations',
    definitionEn: 'To say numbers in order while pointing to each object one by one.',
    definitionEs: 'Decir los números en orden mientras señalas cada objeto uno por uno.',
    exampleEn: '1, 2, 3 stars!',
    exampleEs: '¡1, 2, 3 estrellas!'
  },
  {
    id: 'ten_frame',
    termEn: 'Ten-Frame',
    termEs: 'Marco de Diez',
    tier: 'early',
    category: 'Foundations',
    definitionEn: 'A 2-by-5 grid used to see and organize numbers up to 10.',
    definitionEs: 'Una cuadrícula de 2 por 5 para ver y organizar números hasta el 10.',
    exampleEn: '4 counters in the ten-frame leaves 6 empty boxes.',
    exampleEs: '4 fichas en el marco de diez dejan 6 casillas vacías.'
  },
  {
    id: 'pattern',
    termEn: 'Pattern',
    termEs: 'Patrón',
    tier: 'early',
    category: 'Foundations',
    definitionEn: 'A repeating design or sequence of numbers, colors, or shapes.',
    definitionEs: 'Un diseño o secuencia que se repite de números, colores o figuras.',
    exampleEn: 'Red, Blue, Red, Blue...',
    exampleEs: 'Rojo, Azul, Rojo, Azul...'
  },
  {
    id: 'shape',
    termEn: 'Shape',
    termEs: 'Figura Geométrica',
    tier: 'early',
    category: 'Geometry',
    definitionEn: 'The form of an object, like a circle, square, or triangle.',
    definitionEs: 'La forma de un objeto, como un círculo, cuadrado o triángulo.',
    exampleEn: 'A pizza slice is shaped like a triangle.',
    exampleEs: 'Una rebanada de pizza tiene forma de triángulo.'
  },

  // Elementary (Ages 6-10)
  {
    id: 'numerator',
    termEn: 'Numerator',
    termEs: 'Numerador',
    tier: 'elementary',
    category: 'Arithmetic',
    definitionEn: 'The top number in a fraction showing how many parts you have.',
    definitionEs: 'El número superior en una fracción que muestra cuántas partes tienes.',
    exampleEn: 'In 3/4, 3 is the numerator.',
    exampleEs: 'En 3/4, el 3 es el numerador.'
  },
  {
    id: 'denominator',
    termEn: 'Denominator',
    termEs: 'Denominador',
    tier: 'elementary',
    category: 'Arithmetic',
    definitionEn: 'The bottom number in a fraction showing the total number of equal parts in a whole.',
    definitionEs: 'El número inferior que muestra el número total de partes iguales.',
    exampleEn: 'In 3/4, 4 is the denominator.',
    exampleEs: 'En 3/4, el 4 es el denominador.'
  },
  {
    id: 'place_value',
    termEn: 'Place Value',
    termEs: 'Valor Posicional',
    tier: 'elementary',
    category: 'Arithmetic',
    definitionEn: 'The value represented by a digit based on its position in a number (ones, tens, hundreds).',
    definitionEs: 'El valor de un dígito según su posición (unidades, decenas, centenas).',
    exampleEn: 'In 345, the 3 is worth 300.',
    exampleEs: 'En 345, el 3 vale 300.'
  },
  {
    id: 'perimeter',
    termEn: 'Perimeter',
    termEs: 'Perímetro',
    tier: 'elementary',
    category: 'Geometry',
    definitionEn: 'The total distance around the outside of a closed 2D shape.',
    definitionEs: 'La distancia total alrededor del borde exterior de una figura.',
    exampleEn: 'A rectangle of 3 by 5 has a perimeter of 16.',
    exampleEs: 'Un rectángulo de 3 por 5 tiene un perímetro de 16.'
  },

  // Middle School (Ages 11-13)
  {
    id: 'variable',
    termEn: 'Variable',
    termEs: 'Variable',
    tier: 'middle',
    category: 'Algebra',
    definitionEn: 'A symbol (usually a letter like x or y) representing an unknown quantity or changing value.',
    definitionEs: 'Un símbolo (usualmente una letra como x o y) que representa una cantidad desconocida.',
    exampleEn: 'In 2x + 5 = 15, x is the variable.',
    exampleEs: 'En 2x + 5 = 15, la x es la variable.'
  },
  {
    id: 'coefficient',
    termEn: 'Coefficient',
    termEs: 'Coeficiente',
    tier: 'middle',
    category: 'Algebra',
    definitionEn: 'A numerical factor multiplying a variable in an algebraic expression.',
    definitionEs: 'Un factor numérico que multiplica a una variable.',
    exampleEn: 'In 7x, 7 is the coefficient.',
    exampleEs: 'En 7x, el 7 es el coeficiente.'
  },
  {
    id: 'slope',
    termEn: 'Slope',
    termEs: 'Pendiente',
    tier: 'middle',
    category: 'Algebra',
    definitionEn: 'The steepness and direction of a line, calculated as rise over run (change in y over change in x).',
    definitionEs: 'La inclinación y dirección de una línea: elevación dividida por avance (Δy / Δx).',
    exampleEn: 'Line y = 3x + 2 has a slope of 3.',
    exampleEs: 'La recta y = 3x + 2 tiene una pendiente de 3.'
  },
  {
    id: 'coordinate_plane',
    termEn: 'Coordinate Plane',
    termEs: 'Plano Cartesiano',
    tier: 'middle',
    category: 'Geometry',
    definitionEn: 'A 2D surface formed by the intersection of a horizontal X-axis and vertical Y-axis.',
    definitionEs: 'Una superficie 2D formada por la intersección de los ejes horizontal X y vertical Y.',
    exampleEn: 'Point (3, 4) is 3 units right and 4 units up from the origin.',
    exampleEs: 'El punto (3, 4) está 3 unidades a la derecha y 4 hacia arriba del origen.'
  },

  // High School & Calculus (Ages 14-18)
  {
    id: 'derivative',
    termEn: 'Derivative',
    termEs: 'Derivada',
    tier: 'high',
    category: 'Calculus',
    definitionEn: 'The instantaneous rate of change of a function with respect to a variable; the slope of the tangent line.',
    definitionEs: 'La tasa instantánea de cambio de una función respecto a una variable; la pendiente de la recta tangente.',
    exampleEn: 'The derivative of f(x) = x² is f\'(x) = 2x.',
    exampleEs: 'La derivada de f(x) = x² es f\'(x) = 2x.'
  },
  {
    id: 'tangent_line',
    termEn: 'Tangent Line',
    termEs: 'Recta Tangente',
    tier: 'high',
    category: 'Calculus',
    definitionEn: 'A straight line that touches a smooth curve at a single point, matching the curve\'s instantaneous slope.',
    definitionEs: 'Una recta que toca una curva suave en un solo punto con la misma pendiente instantánea.',
    exampleEn: 'At x = 1, the tangent line to y = x² has slope m = 2.',
    exampleEs: 'En x = 1, la recta tangente a y = x² tiene pendiente m = 2.'
  },
  {
    id: 'limit',
    termEn: 'Limit',
    termEs: 'Límite',
    tier: 'high',
    category: 'Calculus',
    definitionEn: 'The value that a function approaches as the input gets closer and closer to some number.',
    definitionEs: 'El valor al que se aproxima una función cuando la variable de entrada se acerca a un número.',
    exampleEn: 'lim (x->2) of (x² - 4)/(x - 2) = 4.',
    exampleEs: 'lím (x->2) de (x² - 4)/(x - 2) = 4.'
  },
  {
    id: 'integral',
    termEn: 'Integral',
    termEs: 'Integral',
    tier: 'high',
    category: 'Calculus',
    definitionEn: 'The continuous accumulation of a quantity, geometrically representing the signed area under a curve.',
    definitionEs: 'La acumulación continua de una cantidad, representando geométricamente el área bajo una curva.',
    exampleEn: 'The integral of 2x dx is x² + C.',
    exampleEs: 'La integral de 2x dx es x² + C.'
  }
];
