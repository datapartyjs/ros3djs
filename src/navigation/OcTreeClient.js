import { EventEmitter2 } from '../shims/eventemitter2/EventEmitter2.js';
import THREE from '../shims/three/core.js';
import ROSLIB from '../shims/roslib/ROSLIB.js';

import {OcTree} from './OcTree.js';
import {OcTreeBase} from './OcTreeBase.js';
import {ColorOcTree} from './ColorOcTree.js';
import {SceneNode} from '../visualization/SceneNode.js';

/**
 * @author Peter Sari - sari@photoneo.com
 */

export class OcTreeClient extends EventEmitter2 {
  /**
   * An OcTree client that listens to a given OcTree topic.
   *
   * Emits the following events:
   *
   * 'change' - there was an update or change in the marker
   *
   * @constructor
   * @param options - object with following keys:
   *
   *    * ros - the ROSLIB.Ros connection handle
   *    * topic (optional) - the map topic to listen to
   *    * continuous (optional) - if the map should be continuously loaded (e.g., for SLAM)
   *    * tfClient (optional) - the TF client handle to use for a scene node
   *    * compression (optional) - message compression (default: 'cbor')
   *    * rootObject (optional) - the root object to add this marker to
   *    * offsetPose (optional) - offset pose of the mao visualization, e.g. for z-offset (ROSLIB.Pose type)
   *    * colorMode (optional)) - colorization mode for each voxels @see RORS3D.OcTreeColorMode (default 'color')
   *    * color (optional) - color of the visualized map (if solid coloring option was set). Can be any value accepted by THREE.Color
   *    * opacity (optional) - opacity of the visualized grid (0.0 == fully transparent, 1.0 == opaque)
   *    * palette (optional) - list of RGB colors to be used as palette (THREE.Color)
   *    * paletteScale (optional) - scale favtor of palette to cover wider range of values. (default: 1)
   *    * voxelRenderMode (optional)- toggle between rendering modes @see ROS3D.OcTreeVoxelRenderMode. (default `occupid`)
   *
   */

  constructor(options) {
    super();
    options = options || {};
    this.ros = options.ros;
    this.topicName = options.topic || '/octomap';
    this.compression = options.compression || 'cbor';
    this.continuous = options.continuous;
    this.tfClient = options.tfClient;
    this.rootObject = options.rootObject || new THREE.Object3D();
    this.offsetPose = options.offsetPose || new ROSLIB.Pose();

    // Options passed to converter
    this.options = {};

    // Append only when it was set, otherwise defaults are provided by the underlying layer
    if (typeof options.color !== 'undefined') {
      this.options['color'] = options.color;
    }
    if (typeof options.opacity !== 'undefined') {
      this.options['opacity'] = options.opacity;
    }
    if (typeof options.colorMode !== 'undefined') {
      this.options['colorMode'] = options.colorMode;
    }
    if (typeof options.palette !== 'undefined') {
      this.options['palette'] = options.palette;
    }
    if (typeof options.paletteScale !== 'undefined') {
      this.options['paletteScale'] = options.palette;
    }
    if (typeof options.voxelRenderMode !== 'undefined') {
      this.options['voxelRenderMode'] = options.voxelRenderMode;
    }

    // current grid that is displayed
    this.currentMap = null;

    // subscribe to the topic
    this.rosTopic = undefined;
    this.subscribe();
  }

  unsubscribe() {
    if (this.rosTopic) {
      this.rosTopic.unsubscribe();
    }
  }

  _MESSAGE_TYPE = 'octomap_msgs/Octomap';

  subscribe() {
    this.unsubscribe();
    // subscribe to the topic
    this.rosTopic = new ROSLIB.Topic({
      ros: this.ros,
      name: this.topicName,
      messageType: this._MESSAGE_TYPE,
      queue_length: 1,
      compression: this.compression,
    });
    this.rosTopic.subscribe(this.processMessage.bind(this));
  }

  processMessage(message) {
    // check for an old map
    if (this.currentMap) {
      if (this.currentMap.tfClient) {
        this.currentMap.unsubscribeTf();
      }
    }

    this._processMessagePrivate(message);

    if (!this.continuous) {
      this.rosTopic.unsubscribe();
    }
  }

  _loadOcTree(message) {
    return new Promise(
      function (resolve, reject) {
        // 1. Create the corresponding octree object from message
        const options = Object.assign(
          {
            resolution: message.resolution,
          },
          this.options
        );

        let newOcTree = null;
        {
          if (message.binary) {
            newOcTree = new OcTreeBase(options);
            newOcTree.readBinary(message.data);
          } else {
            const ctorTable = {
              OcTree: OcTree,
              ColorOcTree: ColorOcTree,
            };

            if (message.id in ctorTable) {
              console.log(message.id, ctorTable);

              newOcTree = new ctorTable[message.id](options);

              newOcTree.read(message.data);
            }
          }
        }

        {
          newOcTree.buildGeometry();
        }

        resolve(newOcTree);
      }.bind(this)
    );
  }

  _processMessagePrivate(message) {
    let promise = this._loadOcTree(message);

    promise.then(
      // 3. Replace geometry
      function (newOcTree) {
        // check if we care about the scene
        const oldNode = this.sceneNode;
        if (this.tfClient) {
          this.currentMap = newOcTree;
          this.sceneNode = new SceneNode({
            frameID: message.header.frame_id,
            tfClient: this.tfClient,
            object: newOcTree.object,
            pose: this.offsetPose,
          });
        } else {
          this.sceneNode = newOcTree.object;
          this.currentMap = newOcTree;
        }

        this.rootObject.remove(oldNode);
        this.rootObject.add(this.sceneNode);

        this.emit('change');
      }.bind(this)
    );
  }
}
