const revealEls = document.querySelectorAll(".reveal");

for (const el of revealEls) {
	const delay = Number(el.getAttribute("data-delay") || "0");
	el.style.setProperty("--delay", `${delay}ms`);
}

const observer = new IntersectionObserver(
	(entries) => {
		for (const entry of entries) {
			if (entry.isIntersecting) {
				entry.target.classList.add("is-visible");
			}
		}
	},
	{ threshold: 0.18 }
);

for (const el of revealEls) {
	observer.observe(el);
}
