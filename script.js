const lenses = {
  science: {
    kicker: "Η οπτική της επιστήμης",
    title: "Γεωμετρία που γίνεται κίνηση",
    text: "Στη γενική σχετικότητα, η ύλη και η ενέργεια καμπυλώνουν τον χωροχρόνο. Τα σώματα ακολουθούν τις φυσικότερες διαδρομές μέσα σε αυτή τη γεωμετρία — κι εμείς ονομάζουμε την εμπειρία αυτή βαρύτητα.",
    note: "Δεν υπάρχει αόρατο σχοινί. Υπάρχει δομή."
  },
  philosophy: {
    kicker: "Η οπτική της φιλοσοφίας",
    title: "Ένας κόσμος σχέσεων",
    text: "Αν ο χώρος και ο χρόνος δεν είναι ένα ακίνητο δοχείο αλλά κάτι που επηρεάζεται από όσα υπάρχουν, τότε η πραγματικότητα δεν αποτελείται μόνο από πράγματα. Αποτελείται και από τις σχέσεις ανάμεσά τους.",
    note: "Η θέση μας δεν είναι έξω από τον κόσμο, αλλά μέσα στο νόημά του."
  },
  art: {
    kicker: "Η οπτική της τέχνης",
    title: "Το αόρατο αποκτά μορφή",
    text: "Μια καμπύλη, ένας ρυθμός, μια σκιά. Η τέχνη δανείζεται τη γλώσσα της φυσικής χωρίς να προσποιείται ότι είναι εξίσωση. Μας επιτρέπει να αισθανθούμε μια πραγματικότητα που δεν χωρά στις αισθήσεις μας.",
    note: "Όταν δεν μπορούμε να δούμε τον χωροχρόνο, μπορούμε να τον φανταστούμε."
  }
};

const buttons = document.querySelectorAll(".lens-button");
const fields = {
  kicker: document.querySelector("#lens-kicker"),
  title: document.querySelector("#lens-title"),
  text: document.querySelector("#lens-text"),
  note: document.querySelector("#lens-note")
};

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const lens = lenses[button.dataset.lens];
    Object.entries(fields).forEach(([key, element]) => { element.textContent = lens[key]; });
    buttons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
  });
});

const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector("#site-nav");

menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  navigation.classList.toggle("open", !open);
});

navigation.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("open");
  });
});
