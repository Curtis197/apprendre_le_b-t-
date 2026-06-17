const { Jimp } = require('jimp');

async function removeWhiteBg() {
  const image = await Jimp.read('c:\\Users\\DELL LATITUDE 7480\\traduction bété\\web\\public\\logo-original.png');
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    const red = this.bitmap.data[idx + 0];
    const green = this.bitmap.data[idx + 1];
    const blue = this.bitmap.data[idx + 2];
    
    // If pixel is white or almost white
    if (red > 240 && green > 240 && blue > 240) {
      this.bitmap.data[idx + 3] = 0; // alpha to 0
    }
  });
  await image.write('c:\\Users\\DELL LATITUDE 7480\\traduction bété\\web\\public\\logo.png');
  console.log('Background removed via Jimp!');
}

removeWhiteBg().catch(console.error);
