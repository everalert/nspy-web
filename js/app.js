const serial_baud = 115200;

if ('serial' in navigator) {
  document.getElementById('test-connect').addEventListener('click', async () => {
    let port = null;
    let buf = new ArrayBuffer(256);
    const scratch = document.getElementById('scratchpad');

    try {
      const past_ports = await navigator.serial.getPorts();
      if (past_ports.length > 0) {
        port = past_ports[0];
      } else {
        port = await navigator.serial.requestPort();
      }

      if (port != null) {
        await port.open({ baudRate: serial_baud });
        console.log("connected to serial port");
        console.log(port);

        const port_signals = await port.getSignals();
        console.log(port_signals);

        // setup serial stream reading

        let keep_reading = true;
        let reader;
        const read_nintendospy = async () => {
          const input_frame_size = 64; // bits
          let input_frame_rendered = -1;
          let input_frame = 0;
          let input_frame_prev = -1;
          let input_frame_data = new Uint8Array(buf,(input_frame%2)*input_frame_size,input_frame_size);
          let input_frame_data_prev;
          let i_bit = 0;
          while (port.readable && keep_reading) {
            reader = port.readable.getReader();
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break; // reader.cancel() called

                for (key in value) {
                  const val = value[key];
                  switch (val) {
                    case 0:
                      // off bit
                      input_frame_data[i_bit] = 0;
                      i_bit += 1;
                      break;
                    case 49:
                      // ascii '1'; on bit
                      input_frame_data[i_bit] = 1;
                      i_bit += 1;
                      break;
                    case 10:
                      // ascii '\n'; nspy splits input frames by newline
                      if (i_bit != input_frame_size)
                        console.warn(`incorrect frame size (${i_bit}/${input_frame_size})`);
                      input_frame_prev = input_frame;
                      input_frame += 1;
                      input_frame_data_prev = input_frame_data;
                      input_frame_data = new Uint8Array(buf,(input_frame%2)*input_frame_size,input_frame_size);
                      i_bit = 0;
                      break;
                    default:
                      // TODO: unexpected values in stream, probably junk data but should investigate
                      // seen values: 241, 255
                      console.warn(`unexpected ascii value in input stream: ${val}`);
                      break;
                  }
                }

                if (input_frame > 0 && input_frame_prev - input_frame_rendered > 0) {
                  let sx = 0, sy = 0, cx = 0, cy = 0, lt = 0, rt = 0;
                  let x = 0;
                  while (x < 8) {
                    let val = 2**(7-x);
                    if (input_frame_data_prev[16+x]==1) sx += val;
                    if (input_frame_data_prev[24+x]==1) sy += val;
                    if (input_frame_data_prev[32+x]==1) cx += val;
                    if (input_frame_data_prev[40+x]==1) cy += val;
                    if (input_frame_data_prev[48+x]==1) lt += val;
                    if (input_frame_data_prev[56+x]==1) rt += val;
                    x += 1;
                  }
                  scratch.innerText =
                    `Start: ${      input_frame_data_prev[3]==1}\n`
                      + `Y: ${      input_frame_data_prev[4]==1}\n`
                      + `X: ${      input_frame_data_prev[5]==1}\n`
                      + `B: ${      input_frame_data_prev[6]==1}\n`
                      + `A: ${      input_frame_data_prev[7]==1}\n`
                      + `LB: ${     input_frame_data_prev[9]==1}\n`
                      + `RB: ${     input_frame_data_prev[10]==1}\n`
                      + `Z: ${      input_frame_data_prev[11]==1}\n`
                      + `D-Up: ${   input_frame_data_prev[12]==1}\n`
                      + `D-Down: ${ input_frame_data_prev[13]==1}\n`
                      + `D-Right: ${input_frame_data_prev[14]==1}\n`
                      + `D-Left: ${ input_frame_data_prev[15]==1}\n`
                      + `StickX: ${sx-128}\n`
                      + `StickY: ${sy-128}\n`
                      + `CStickX: ${cx-128}\n`
                      + `CStickY: ${cy-128}\n`
                      + `TriggerL: ${lt}\n`
                      + `TriggerR: ${rt}\n`;
                }

                input_frame_rendered = input_frame_prev;
              }
            } catch (e) {
              console.error(e);
            } finally {
              reader.releaseLock();
            }
          }
          await port.close();
        }
        const readable_closed = read_nintendospy();

        // update buttons

        btn_connect = document.getElementById('test-connect')
        btn_disconnect = document.getElementById('test-disconnect')
        btn_clear = document.getElementById('test-clear')

        const disconnect = async () => {
          keep_reading = false;
          reader.cancel();
          await readable_closed.catch(()=>{});
        }

        const reset = () => {
          port = null;
          btn_disconnect.removeEventListener('click', disconnect_click);
          btn_disconnect.disabled = true;
          btn_clear.removeEventListener('click', clear_click);
          btn_clear.disabled = true;
          btn_connect.disabled = false;
          scratch.innerText = '';
        }

        const disconnect_click = async () => {
          try {
            await disconnect();
            reset();
          } catch (e) {
            console.error(e);
          }
        }
        btn_disconnect.addEventListener('click', disconnect_click);
        btn_disconnect.disabled = false;

        const clear_click = async () => {
          try {
            await disconnect();
            await port.forget();
            reset();
          } catch (e) {
            console.error(e);
          }
        }
        btn_clear.addEventListener('click', clear_click);
        btn_clear.disabled = false;

        btn_connect.disabled = true;
      }
    } catch (e) {
      console.error(e);
    }
  });
} else {
  console.error('web serial api not supported or enabled in your browser sadge');
}
