// Fonction simple pour formater un prix
export const formatPrice = (price) => {
    if (price === null || price === undefined) return "Prix inconnu";
    
    // Convertir en nombre si c'est une chaîne
    const numPrice = parseFloat(price);
    
    if (isNaN(numPrice)) return "Prix invalide";
    
    // Formatage propre : 150 -> 150,00 €
    return numPrice.toFixed(2).replace('.', ',') + ' €';
  };