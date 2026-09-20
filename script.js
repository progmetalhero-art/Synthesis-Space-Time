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

const lightConeCanvas = document.querySelector("#light-cone-canvas");

if (lightConeCanvas) {
  const context = lightConeCanvas.getContext("2d");
  const spaceInput = document.querySelector("#event-space");
  const timeInput = document.querySelector("#event-time");
  const spaceValue = document.querySelector("#event-space-value");
  const timeValue = document.querySelector("#event-time-value");
  const stateLabel = document.querySelector("#cone-state");
  const explanation = document.querySelector("#cone-explanation");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stars = Array.from({ length: 58 }, (_, index) => ({
    x: ((index * 73) % 997) / 997,
    y: ((index * 151 + 31) % 991) / 991,
    size: index % 7 === 0 ? 1.8 : 1
  }));
  let pulse = 0;
  let animationFrame;

  const formatValue = (value) => Number(value).toLocaleString("el-GR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const classifyEvent = (space, time) => {
    const margin = Math.abs(time) - Math.abs(space);
    if (Math.abs(margin) < 0.13) return {
      label: "ΠΑΝΩ ΣΤΟ ΟΡΙΟ ΤΟΥ ΦΩΤΟΣ",
      text: "Μόνο ένα φωτεινό σήμα μπορεί να συνδέσει τα δύο γεγονότα. Η διαδρομή βρίσκεται ακριβώς στην επιφάνεια του φωτεινού κώνου.",
      color: "#eef4f7"
    };
    if (margin > 0 && time > 0) return {
      label: "ΜΕΛΛΟΝ / ΧΡΟΝΟΕΙΔΗΣ ΑΠΟΣΤΑΣΗ",
      text: "Το γεγονός βρίσκεται μέσα στον μελλοντικό φωτεινό κώνο. Ένα σήμα από το εδώ και τώρα μπορεί, καταρχήν, να το επηρεάσει.",
      color: "#74d5e7"
    };
    if (margin > 0) return {
      label: "ΠΑΡΕΛΘΟΝ / ΧΡΟΝΟΕΙΔΗΣ ΑΠΟΣΤΑΣΗ",
      text: "Το γεγονός βρίσκεται μέσα στον παρελθοντικό φωτεινό κώνο. Θα μπορούσε, καταρχήν, να έχει επηρεάσει το εδώ και τώρα.",
      color: "#f0a04b"
    };
    return {
      label: "ΑΛΛΟΥ / ΧΩΡΟΕΙΔΗΣ ΑΠΟΣΤΑΣΗ",
      text: "Το γεγονός βρίσκεται στο «αλλού»: ούτε φως ούτε πληροφορία προλαβαίνει να το συνδέσει αιτιακά με την αρχή των αξόνων.",
      color: "#9aa7af"
    };
  };

  const drawLightCone = () => {
    const width = lightConeCanvas.width;
    const height = lightConeCanvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const scaleX = width / 12;
    const scaleY = height / 12;
    const space = Number(spaceInput.value);
    const time = Number(timeInput.value);
    const pointX = centerX + space * scaleX;
    const pointY = centerY - time * scaleY;
    const classification = classifyEvent(space, time);

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#090d13";
    context.fillRect(0, 0, width, height);

    stars.forEach((star) => {
      context.beginPath();
      context.fillStyle = "rgba(238,244,247,.26)";
      context.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
      context.fill();
    });

    context.fillStyle = "rgba(116,213,231,.09)";
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX - 6 * scaleX, centerY - 6 * scaleY);
    context.lineTo(centerX + 6 * scaleX, centerY - 6 * scaleY);
    context.closePath();
    context.fill();

    context.fillStyle = "rgba(240,160,75,.08)";
    context.beginPath();
    context.moveTo(centerX, centerY);
    context.lineTo(centerX - 6 * scaleX, centerY + 6 * scaleY);
    context.lineTo(centerX + 6 * scaleX, centerY + 6 * scaleY);
    context.closePath();
    context.fill();

    context.strokeStyle = "rgba(238,244,247,.18)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(54, centerY);
    context.lineTo(width - 36, centerY);
    context.moveTo(centerX, height - 34);
    context.lineTo(centerX, 34);
    context.stroke();

    context.strokeStyle = "rgba(238,244,247,.58)";
    context.lineWidth = 2.5;
    context.setLineDash([10, 9]);
    context.beginPath();
    context.moveTo(centerX - 6 * scaleX, centerY + 6 * scaleY);
    context.lineTo(centerX + 6 * scaleX, centerY - 6 * scaleY);
    context.moveTo(centerX - 6 * scaleX, centerY - 6 * scaleY);
    context.lineTo(centerX + 6 * scaleX, centerY + 6 * scaleY);
    context.stroke();
    context.setLineDash([]);

    context.font = "600 24px system-ui, sans-serif";
    context.fillStyle = "rgba(238,244,247,.58)";
    context.fillText("t", centerX + 18, 46);
    context.fillText("x", width - 48, centerY - 18);
    context.font = "500 17px system-ui, sans-serif";
    context.fillStyle = "rgba(116,213,231,.72)";
    context.fillText("ΜΕΛΛΟΝ", centerX + 24, 86);
    context.fillStyle = "rgba(240,160,75,.72)";
    context.fillText("ΠΑΡΕΛΘΟΝ", centerX + 24, height - 60);
    context.fillStyle = "rgba(238,244,247,.72)";
    context.fillText("εδώ + τώρα", centerX + 15, centerY + 28);

    context.beginPath();
    context.fillStyle = classification.color;
    context.globalAlpha = .16 + pulse * .08;
    context.arc(pointX, pointY, 24 + pulse * 8, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.beginPath();
    context.fillStyle = classification.color;
    context.arc(pointX, pointY, 8, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "rgba(238,244,247,.72)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(pointX, pointY);
    context.lineTo(pointX, centerY);
    context.moveTo(pointX, pointY);
    context.lineTo(centerX, pointY);
    context.stroke();

    spaceValue.value = formatValue(space);
    timeValue.value = formatValue(time);
    stateLabel.textContent = classification.label;
    stateLabel.style.color = classification.color;
    explanation.textContent = classification.text;
  };

  const animate = () => {
    pulse = (Math.sin(performance.now() / 600) + 1) / 2;
    drawLightCone();
    animationFrame = requestAnimationFrame(animate);
  };

  const setFromPointer = (event) => {
    const bounds = lightConeCanvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 12 - 6;
    const t = 6 - ((event.clientY - bounds.top) / bounds.height) * 12;
    spaceInput.value = Math.max(-5, Math.min(5, x)).toFixed(1);
    timeInput.value = Math.max(-5, Math.min(5, t)).toFixed(1);
    drawLightCone();
  };

  [spaceInput, timeInput].forEach((input) => input.addEventListener("input", drawLightCone));
  lightConeCanvas.addEventListener("pointerdown", (event) => {
    lightConeCanvas.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });
  lightConeCanvas.addEventListener("pointermove", (event) => {
    if (lightConeCanvas.hasPointerCapture(event.pointerId)) setFromPointer(event);
  });

  drawLightCone();
  if (!reduceMotion) animate();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && animationFrame) cancelAnimationFrame(animationFrame);
    else if (!document.hidden && !reduceMotion) animate();
  });
}
