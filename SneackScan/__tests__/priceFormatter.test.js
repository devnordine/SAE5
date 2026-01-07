import { formatPrice } from '../utils/priceFormatter';

describe('Utilitaire : formatPrice', () => {
    
    it('Formate correctement un entier', () => {
        expect(formatPrice(100)).toBe('100,00 €');
    });

    it('Formate correctement un décimal', () => {
        expect(formatPrice(12.5)).toBe('12,50 €');
    });

    it('Gère les chaînes de caractères convertibles', () => {
        expect(formatPrice("50")).toBe('50,00 €');
    });

    it('Gère les valeurs nulles ou undefined', () => {
        expect(formatPrice(null)).toBe('Prix inconnu');
        expect(formatPrice(undefined)).toBe('Prix inconnu');
    });

    it('Gère les textes invalides', () => {
        expect(formatPrice("abc")).toBe('Prix invalide');
    });
});