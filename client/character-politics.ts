import {
  black, cone, cube, gold, ivory, material, mesh, paint, red, sphere,
  type CharacterParts,
} from './character-shapes';

// Original toy-like caricatures, built from the same shared low-poly primitives.
const blue = material('CharacterPresidentialBlue', '#2668ad');
const hairHighlight = material('CharacterChestnutHighlight', '#76523b');
const blondeHighlight = material('CharacterBlondeHighlight', '#edcd83');
const jacketTrim = material('CharacterJacketTrim', '#822454');
const silver = material('CharacterNecklaceSilver', '#d2dfe1', .36, .42);

/** Rigid details are merged by the caller; common facial and arm rigs stay free. */
export function addPoliticalCostume(id: string, parts: CharacterParts): boolean {
  const { face, torso, suit, hair } = parts;
  switch (id) {
    case 'macron': {
      // Neat short hair leaves an exaggerated high forehead visible.
      mesh(face, sphere, hair, [0, .30, -.10], [.365, .185, .295]);
      for (const side of [-1, 1]) {
        mesh(face, sphere, hair, [side * .325, .15, -.10], [.055, .17, .22]);
      }
      const parting = mesh(face, cube, hairHighlight, [-.14, .43, -.04], [.023, .016, .27]);
      parting.rotation.y = -.19;
      const fringe = mesh(face, sphere, hair, [.13, .345, .16], [.19, .07, .12]);
      fringe.rotation.z = -.14;
      mesh(torso, cube, ivory, [0, .55, .25], [.18, .32, .045]);
      mesh(torso, cube, blue, [0, .49, .285], [.065, .31, .037]);
      const knot = mesh(torso, cube, blue, [0, .66, .282], [.064, .064, .04]);
      knot.rotation.z = Math.PI / 4;
      for (const side of [-1, 1]) {
        const lapel = mesh(torso, cube, suit, [side * .135, .58, .26], [.092, .30, .05]);
        lapel.rotation.z = side * .34;
      }
      // Tiny tricolour lapel pin and playful oversized pocket square.
      for (const [index, color] of [blue, ivory, red].entries()) {
        mesh(torso, cube, color, [.177 + index * .024, .605, .278], [.024, .049, .024]);
      }
      const square = mesh(torso, cube, paint, [-.23, .50, .255], [.095, .065, .035]);
      square.rotation.z = -.13;
      mesh(torso, sphere, gold, [0, .24, .28], [.027, .027, .016]);
      return true;
    }
    case 'merkel': {
      // A large blonde bob reads clearly from the chase camera as well as front-on.
      mesh(face, sphere, hair, [0, .12, -.16], [.43, .37, .26]);
      mesh(face, sphere, hair, [0, .29, -.075], [.415, .23, .33]);
      for (const side of [-1, 1]) {
        mesh(face, sphere, hair, [side * .35, -.01, -.07], [.13, .34, .25]);
        const fringe = mesh(face, sphere, hair, [side * .16, .29, .205], [.225, .077, .10]);
        fringe.rotation.z = side * -.26;
        const highlight = mesh(face, sphere, blondeHighlight, [side * .395, .075, -.13], [.026, .205, .16]);
        highlight.rotation.z = side * -.08;
        mesh(face, sphere, silver, [side * .415, -.145, .07], [.034, .042, .035]);
      }
      mesh(torso, cube, ivory, [0, .61, .244], [.19, .17, .04]);
      for (const side of [-1, 1]) {
        const collar = mesh(torso, cube, jacketTrim, [side * .12, .65, .248], [.13, .095, .048]);
        collar.rotation.z = side * .3;
      }
      mesh(torso, cube, jacketTrim, [0, .40, .271], [.027, .36, .025]);
      for (let i = 0; i < 3; i++) {
        mesh(torso, sphere, silver, [.055, .53 - i * .12, .28], [.023, .023, .015]);
      }
      for (let i = 0; i < 7; i++) {
        const angle = (i / 6 - .5) * Math.PI;
        mesh(torso, sphere, silver, [Math.sin(angle) * .12, .685 - Math.cos(angle) * .11, .281], [.018, .018, .014]);
      }
      // A diamond pendant nods to her familiar gesture without fixing the hands.
      const diamond = mesh(torso, cube, gold, [0, .55, .30], [.069, .069, .027]);
      diamond.rotation.z = Math.PI / 4;
      const center = mesh(torso, cube, paint, [0, .55, .317], [.034, .034, .013]);
      center.rotation.z = Math.PI / 4;
      return true;
    }
    case 'napoleon': {
      mesh(face, sphere, hair, [0, .22, -.10], [.37, .24, .29]);
      for (const side of [-1, 1]) {
        mesh(face, sphere, hair, [side * .32, .055, -.11], [.075, .23, .21]);
      }
      // The exaggerated bicorne has upturned tips and a rounded central crown.
      mesh(face, sphere, black, [0, .40, -.015], [.62, .075, .28]);
      mesh(face, sphere, black, [0, .51, -.025], [.49, .245, .22]);
      for (const side of [-1, 1]) {
        const wing = mesh(face, sphere, black, [side * .40, .49, -.02], [.29, .13, .20]);
        wing.rotation.z = side * .30;
        const tip = mesh(face, cone, black, [side * .59, .53, -.02], [.105, .27, .14]);
        tip.rotation.z = side * -1.1;
        const braid = mesh(face, cube, gold, [side * .325, .42, .23], [.34, .025, .022]);
        braid.rotation.z = side * .13;
      }
      mesh(face, sphere, red, [0, .57, .198], [.075, .085, .026]);
      mesh(face, sphere, ivory, [0, .57, .221], [.05, .058, .018]);
      mesh(face, sphere, blue, [0, .57, .238], [.026, .035, .012]);
      mesh(torso, cube, ivory, [0, .44, .258], [.28, .45, .055]);
      mesh(torso, cube, red, [0, .705, .19], [.25, .085, .067]);
      for (const side of [-1, 1]) {
        const lapel = mesh(torso, cube, ivory, [side * .19, .58, .26], [.105, .29, .055]);
        lapel.rotation.z = side * .24;
        mesh(torso, sphere, gold, [side * .31, .67, .025], [.145, .055, .16]);
        for (let fringe = 0; fringe < 3; fringe++) {
          mesh(torso, cube, gold, [side * (.245 + fringe * .042), .607, .13], [.027, .10, .025]);
        }
        for (let button = 0; button < 3; button++) {
          mesh(torso, sphere, gold, [side * .08, .56 - button * .12, .294], [.025, .025, .017]);
        }
      }
      const sash = mesh(torso, cube, paint, [-.10, .46, .306], [.06, .49, .022]);
      sash.rotation.z = -.45;
      mesh(torso, cube, gold, [0, .20, .291], [.30, .035, .025]);
      return true;
    }
    default:
      return false;
  }
}
