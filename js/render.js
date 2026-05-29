let lastGoodPageWidth = null;

export async function createToolkit() {

  await waitForVerovio();

  const toolkit = new verovio.toolkit();

  return toolkit;
}

async function waitForVerovio(timeout = 10000) {

  return new Promise((resolve, reject) => {

    const start = performance.now();

    function poll() {

      if (window.verovio && window.verovio.toolkit) {
        resolve();
        return;
      }

      if (performance.now() - start > timeout) {
        reject(new Error("Verovio failed to load"));
        return;
      }

      setTimeout(poll, 40);
    }

    poll();
  });
}

function svgIntrinsicWidthPx(targetElement) {

  const svg = targetElement.querySelector('svg');

  if (!svg) return 0;

  const widthAttr =
    parseFloat(svg.getAttribute('width') || '0');

  if (widthAttr > 0) return widthAttr;

  try {
    return svg.getBBox().width || 0;
  }
  catch {
    return 0;
  }
}

function viewerAvailableWidth(targetElement) {

  const rect =
    targetElement.getBoundingClientRect();

  const width = Math.max(
    340,
    Math.floor(rect.width || 0)
  );

  console.log('available width:', width, rect);

  return Math.max(
    340,
    Math.floor(rect.width || 0)
  );


}

async function renderWithPageWidth(
  toolkit,
  krnText,
  targetElement,
  options,
  pageWidth,
  transposeValue = ''
) {
console.log('rendering with pageWidth:', pageWidth);
  toolkit.setOptions({

    scale: options.scale,

    pageWidth: Math.round(pageWidth * (100 / options.scale)),

    transpose: transposeValue,

    adjustPageHeight: true,

    spacingLinear: options.spacing,

    spacingNonLinear: 0.46,

    pageMarginTop: 10,
    pageMarginBottom: 10,
    pageMarginLeft: 12,
    pageMarginRight: 12,

    noJustification: false,
    justifyVertically: false,

    breaks: "auto"
  });

  toolkit.loadData(krnText);

  const svg =
    toolkit.renderToSVG(1, {});

  targetElement.innerHTML = svg;
}

export async function renderKrn(
  toolkit,
  krnText,
  targetElement,
  options,
  transposeValue = ''
) {

  const available =
    viewerAvailableWidth(targetElement);

  const hardMax =
    Math.floor(available - 6);

  const FILL_TARGET = 0.92;

  let pageWidth =
    lastGoodPageWidth || available;

  await renderWithPageWidth(
    toolkit,
    krnText,
    targetElement,
    options,
    pageWidth,
    transposeValue
  );

  let width =
    svgIntrinsicWidthPx(targetElement);

  let tries = 0;


  pageWidth = available;

  await renderWithPageWidth(
    toolkit,
    krnText,
    targetElement,
    options,
    pageWidth,
    transposeValue
  );

  lastGoodPageWidth = pageWidth;
}
